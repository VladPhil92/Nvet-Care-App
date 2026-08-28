import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  ConflictException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { MailService } from "../../common/mail/mail.service";
import { AuditAction, AuditSeverity } from "@prisma/client";

/**
 * EmailVerificationService — flujo de verificación de email vía token único.
 *
 * Decisiones de seguridad:
 *  - Token de 32 bytes random (256 bits de entropía) en formato `<userId>.<rawToken>`
 *  - El token bruto NUNCA se persiste — solo su hash SHA-256
 *  - TTL: 24h (más permisivo que reset porque el usuario podría retrasarse)
 *  - Single-use: tras consumir, se borra el hash de la DB
 *  - Si el usuario ya está verificado → retorna 409 ConflictException
 *  - Cada `requestVerification` invalida el token anterior
 *  - Comparación timing-safe del hash para evitar leaks por timing
 *  - Audit log en cada acción (envío + verificación exitosa)
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly TOKEN_TTL_HOURS = 24;
  private readonly TOKEN_BYTES = 32;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Genera un nuevo token de verificación y dispara el email.
   * El usuario debe estar autenticado (este endpoint requiere JWT).
   */
  async requestVerification(
    userId: string,
    ctx: { ip?: string; userAgent?: string } = {},
  ): Promise<{ message: string; expiresInHours: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        emailVerified: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Usuario no encontrado o inactivo");
    }

    if (user.emailVerified) {
      throw new ConflictException("Tu correo electrónico ya está verificado");
    }

    const rawToken = crypto.randomBytes(this.TOKEN_BYTES).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + this.TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
      },
    });

    const publicToken = `${user.id}.${rawToken}`;
    await this.sendVerificationEmail(
      user.email,
      user.firstName ?? "usuario",
      publicToken,
    );

    await this.auditService.log({
      actor: { id: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
      action: AuditAction.EMAIL_VERIFICATION_SENT,
      severity: AuditSeverity.INFO,
      targetType: "User",
      targetId: user.id,
      reason: "verification_email_dispatched",
    });

    return {
      message:
        "Te enviamos un enlace de verificación a tu correo. Revisa tu bandeja de entrada.",
      expiresInHours: this.TOKEN_TTL_HOURS,
    };
  }

  /**
   * Consume el token y marca el email como verificado.
   * Endpoint público (cualquiera con el link puede activar la cuenta del usuario
   * porque el token es secreto y de un solo uso).
   */
  async verifyEmail(
    publicToken: string,
    ctx: { ip?: string; userAgent?: string } = {},
  ): Promise<{ message: string; emailVerified: boolean }> {
    const parts = publicToken.split(".");
    if (parts.length !== 2) {
      throw new BadRequestException("Token de verificación inválido");
    }
    const [userId, rawToken] = parts;
    const tokenHash = this.hashToken(rawToken);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        emailVerificationTokenHash: true,
        emailVerificationExpiresAt: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Token inválido o expirado");
    }

    // Idempotente: si ya estaba verificado, retornamos OK sin error.
    if (user.emailVerified) {
      return {
        message: "Tu correo ya estaba verificado.",
        emailVerified: true,
      };
    }

    if (!user.emailVerificationTokenHash || !user.emailVerificationExpiresAt) {
      throw new UnauthorizedException(
        "No hay solicitud de verificación pendiente. Solicita un nuevo enlace.",
      );
    }

    // Comparación timing-safe del hash
    const a = Buffer.from(user.emailVerificationTokenHash);
    const b = Buffer.from(tokenHash);
    const tokenMatches = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!tokenMatches) {
      throw new UnauthorizedException("Token inválido o expirado");
    }
    if (user.emailVerificationExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        "El enlace de verificación expiró. Solicita uno nuevo.",
      );
    }

    // Marcar como verificado + limpiar token
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });

    await this.auditService.log({
      actor: { id: userId, ip: ctx.ip, userAgent: ctx.userAgent },
      action: AuditAction.EMAIL_VERIFIED,
      severity: AuditSeverity.INFO,
      targetType: "User",
      targetId: userId,
      reason: "email_verification_completed",
    });

    this.logger.log(`Email verificado userId=${userId}`);

    return {
      message: "¡Tu correo electrónico fue verificado correctamente!",
      emailVerified: true,
    };
  }

  // ============================================================
  // INTERNAL
  // ============================================================

  private hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }

  /**
   * Despacha el email de verificación usando MailService.
   * Driver configurable vía `MAIL_DRIVER` env var.
   */
  private async sendVerificationEmail(
    email: string,
    firstName: string,
    publicToken: string,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? "https://app.nvetcare.co";
    const verifyLink = `${frontendUrl}/verify-email?token=${encodeURIComponent(
      publicToken,
    )}`;

    const result = await this.mailService.sendEmailVerification({
      to: email,
      firstName,
      verifyLink,
      expiresInHours: this.TOKEN_TTL_HOURS,
    });

    if (!result.ok) {
      this.logger.warn(
        `Verification email FAIL (driver=${result.driver}, to=${email}): ${result.error}`,
      );
    } else {
      this.logger.log(
        `Verification email enviado (driver=${result.driver}, providerId=${
          result.providerMessageId ?? "-"
        }, to=${email})`,
      );
    }
  }
}
