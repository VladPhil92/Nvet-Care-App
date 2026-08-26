import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';
import { PasswordResetService } from './services/password-reset.service';
import { EmailVerificationService } from './services/email-verification.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { TwoFactorService } from './services/two-factor.service';
import { CtgIdentityService } from './services/ctg-identity.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailVerifiedGuard } from './guards/email-verified.guard';
import { RolesGuard } from './guards/roles.guard';
import { WsJwtGuard, WsEmailVerifiedGuard } from './guards/ws-jwt.guard';

/**
 * AuthModule — wiring de todos los servicios de seguridad endurecidos.
 *
 * Servicios provisionados:
 *  - AuthService           → orquesta login/register/logout/refresh/2FA
 *  - PasswordService       → Argon2id + validación de fortaleza
 *  - PasswordResetService  → flujo de reset por email
 *  - TwoFactorService      → TOTP (Google Authenticator) + recovery codes
 *  - CtgIdentityService    → verifica tokens de Supabase (CTG One) contra su JWKS
 *  - TokenBlacklistService → revocación de JWT (Redis-backed en prod)
 *  - JwtStrategy           → validación de JWT en requests
 *  - JwtAuthGuard          → protege rutas autenticadas
 *  - RolesGuard            → autorización por rol
 *  - WsJwtGuard            → autenticación de WebSockets
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '15m',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    PasswordResetService,
    EmailVerificationService,
    TokenBlacklistService,
    TwoFactorService,
    CtgIdentityService,
    JwtStrategy,
    JwtAuthGuard,
    EmailVerifiedGuard,
    RolesGuard,
    WsJwtGuard,
    WsEmailVerifiedGuard,
  ],
  exports: [
    AuthService,
    PasswordService,
    TwoFactorService,
    TokenBlacklistService,
    JwtAuthGuard,
    EmailVerifiedGuard,
    RolesGuard,
    WsJwtGuard,
    WsEmailVerifiedGuard,
    JwtModule,
  ],
})
export class AuthModule {}
