import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Decorator: marca una ruta como exenta del check de email verificado.
 * Útil para endpoints que necesitan ser accesibles antes de la verificación
 * (ej: GET /auth/me, POST /auth/send-verification-email, POST /auth/verify-email).
 *
 * @example
 *   @Get('me')
 *   @SkipEmailVerification()
 *   async getMe() { ... }
 */
export const SKIP_EMAIL_VERIFICATION_KEY = 'skipEmailVerification';
export const SkipEmailVerification = () =>
  SetMetadata(SKIP_EMAIL_VERIFICATION_KEY, true);

/**
 * EmailVerifiedGuard — bloquea acciones críticas (booking, pagos, mensajes)
 * hasta que el usuario haya verificado su email.
 *
 * Decisiones:
 *  - Lee `req.user.emailVerified` poblado por `JwtStrategy.validate()`.
 *  - Si falta (ej: payload viejo sin el campo), re-lee de DB sería overkill;
 *    confiamos en JwtStrategy para que ya hizo ese refresh.
 *  - ADMIN se considera implícitamente verificado (opera con email interno).
 *  - Ruta puede declararse @SkipEmailVerification() para excepciones puntuales.
 *
 * Aplicación recomendada:
 *  - POST /appointments (cliente debe verificar antes de bookear)
 *  - POST /payments/* (no se permite mover dinero sin verificar)
 *  - POST /chat/.../messages (anti-abuso de cuentas no verificadas)
 *
 * Uso:
 *   @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
 *   @Post('appointments')
 *   async create() { ... }
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  private readonly logger = new Logger(EmailVerifiedGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_EMAIL_VERIFICATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      // No debería llegar aquí si JwtAuthGuard se aplica antes,
      // pero defendemos en profundidad.
      throw new ForbiddenException('Autenticación requerida');
    }

    // Admins están implícitamente verificados (cuenta interna gestionada).
    if (user.role === 'ADMIN') return true;

    if (user.emailVerified === true) return true;

    this.logger.warn(
      `Email no verificado bloqueando acceso: userId=${user.id} ` +
        `route=${req.method} ${req.url}`,
    );

    throw new ForbiddenException({
      message:
        'Debes verificar tu correo electrónico antes de realizar esta acción. Revisa tu bandeja de entrada o solicita un nuevo enlace de verificación.',
      error: 'EMAIL_NOT_VERIFIED',
      action: 'send_verification_email',
    });
  }
}
