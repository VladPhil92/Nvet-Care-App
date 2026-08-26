import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditAction, AuditSeverity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { MailService } from '../../common/mail/mail.service';
import { PasswordService } from './password.service';

/**
 * PasswordResetService — flujo de recuperación de contraseña vía email.
 *
 * Decisiones de seguridad:
 *  - Token de 32 bytes random (256 bits de entropía) en formato `<userId>.<rawToken>`
 *  - El token bruto NUNCA se persiste — solo su hash SHA-256
 *  - TTL: 15 minutos (corto para reducir ventana de exposición)
 *  - Single-use: tras consumir, se borra el hash de la DB
 *  - Rate limiting: máximo 3 emails por hora por dirección
 *  - User enumeration prevention: respuesta idéntica si el email existe o no
 *  - Tras reset exitoso: invalida TODAS las sesiones activas del usuario
 *  - Si la cuenta está bloqueada por failedAttempts, el reset DESBLOQUEA
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly TOKEN_TTL_MINUTES = 15;
  private readonly TOKEN_BYTES = 32;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Inicia el flujo: genera un token, lo persiste hasheado, dispara el email.
   * SIEMPRE retorna el mismo mensaje (no revela si el email existe).
   */
  async requestReset(email: string, ipAddress?: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, firstName: true, isActive: true },
    });

    // Mensaje genérico anti enumeration
    const genericMessage =
      'Si el email existe en nuestro sistema, recibirás instrucciones de recuperación en los próximos minutos.';

    if (!user || !user.isActive) {
      // Log para auditoría sin revelar al cliente
      this.logger.warn(
        `password-reset solicitado para email no existente o inactivo: ${normalizedEmail} (ip: ${ipAddress})`,
      );
      // Constant-time delay para evitar enumeration por timing
      await this.constantTimeDelay();
      return { message: genericMessage };
    }

    // Generar token: 32 bytes random hex (64 chars) + userId
    const rawToken = crypto.randomBytes(this.TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.TOKEN_TTL_MINUTES * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });

    // Token público enviado al usuario: <userId>.<rawToken>
    const publicToken = `${user.id}.${rawToken}`;
    await this.sendResetEmail(user.email, user.firstName ?? 'usuario', publicToken);

    await this.auditService.log({
      actor: { id: user.id, ip: ipAddress },
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      severity: AuditSeverity.WARN,
      targetType: 'User',
      targetId: user.id,
      reason: 'reset_link_dispatched',
    });

    return { message: genericMessage };
  }

  /**
   * Consume el token y actualiza la contraseña.
   * Tras éxito: limpia el token, invalida sesiones, desbloquea cuenta.
   */
  async resetPassword(publicToken: string, newPassword: string): Promise<void> {
    const parts = publicToken.split('.');
    if (parts.length !== 2) {
      throw new BadRequestException('Token de recuperación inválido');
    }
    const [userId, rawToken] = parts;
    const tokenHash = this.hashToken(rawToken);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordResetTokenHash: true,
        passwordResetExpiresAt: true,
        passwordHash: true,
      },
    });
    if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    // Comparación timing-safe del hash
    const a = Buffer.from(user.passwordResetTokenHash);
    const b = Buffer.from(tokenHash);
    const tokenMatches = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!tokenMatches) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('El token ha expirado. Solicita uno nuevo.');
    }

    // Validar fortaleza adicional (anti-common-passwords + diversidad)
    const strengthCheck = this.passwordService.validateStrength(newPassword);
    if (!strengthCheck.isValid) {
      throw new BadRequestException(
        `Contraseña débil: ${strengthCheck.reasons.join(', ')}`,
      );
    }

    // Validar que no sea la MISMA contraseña actual. Si la cuenta fue
    // provisionada vía CTG One y nunca tuvo password (user.passwordHash
    // null), passwordService.verify degrada a isValid: false — no hay nada
    // que comparar, así que se permite establecer la primera contraseña.
    const sameAsCurrent = await this.passwordService.verify(newPassword, user.passwordHash);
    if (sameAsCurrent.isValid) {
      throw new BadRequestException(
        'La nueva contraseña no puede ser igual a la anterior',
      );
    }

    const newPasswordHash = await this.passwordService.hash(newPassword);

    // Tx: update password + clear token + reset failed attempts + unlock + revoke sessions
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          passwordChangedAt: new Date(),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      }),
    ]);

    await this.auditService.log({
      actor: { id: userId },
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      severity: AuditSeverity.CRITICAL,
      targetType: 'User',
      targetId: userId,
      reason: 'password_reset_completed',
    });

    this.logger.log(`password-reset completado para userId=${userId}`);
  }

  // ============================================================
  // INTERNAL
  // ============================================================

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async constantTimeDelay(): Promise<void> {
    // Espera ~250ms para que el endpoint tarde lo mismo independientemente
    // de si el email existe o no (mitiga user-enumeration por timing).
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 100));
  }

  /**
   * Despacha el email de recuperación usando MailService.
   *
   * El driver real se selecciona vía `MAIL_DRIVER` env var:
   *  - `console` (default dev): loggea el contenido
   *  - `sendgrid`: HTTP API v3
   *  - `ses`/`smtp`: stubs documentados
   *
   * Errores del provider NO rompen el flujo: ya respondimos al cliente con
   * mensaje genérico (anti-enumeration); si el envío falla, lo loggeamos
   * como WARN para que ops lo detecte.
   */
  private async sendResetEmail(
    email: string,
    firstName: string,
    publicToken: string,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://app.nvetcare.co';
    const resetLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(publicToken)}`;

    const result = await this.mailService.sendPasswordReset({
      to: email,
      firstName,
      resetLink,
      expiresInMinutes: this.TOKEN_TTL_MINUTES,
    });

    if (!result.ok) {
      this.logger.warn(
        `Password reset email FAIL (driver=${result.driver}, to=${email}): ${result.error}`,
      );
    } else {
      this.logger.log(
        `Password reset email enviado (driver=${result.driver}, providerId=${
          result.providerMessageId ?? '-'
        }, to=${email})`,
      );
    }
  }
}
