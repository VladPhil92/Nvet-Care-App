import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle, seconds } from "@nestjs/throttler";

import { AuthService } from "./auth.service";
import { PasswordResetService } from "./services/password-reset.service";
import { EmailVerificationService } from "./services/email-verification.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  TwoFactorEnableDto,
  TwoFactorDisableDto,
  TwoFactorRecoveryDto,
  RefreshTokenDto,
  VerifyEmailDto,
  CtgIdentityExchangeDto,
} from "./dto/auth.dto";

/**
 * AuthController — endpoints de autenticación production-grade.
 *
 * Rate limiting agresivo en endpoints sensibles (register, login, forgot-password)
 * para mitigar brute force y email enumeration.
 *
 * Mapa de endpoints:
 *   POST   /auth/register                  — Crear cuenta
 *   POST   /auth/login                     — Login (con 2FA opcional)
 *   POST   /auth/login/recovery            — Login con recovery code (perdió TOTP)
 *   POST   /auth/ctg-identity-exchange     — Login vía sesión CTG One (docs/identity/ADR-001)
 *   POST   /auth/refresh                   — Renovar access token
 *   POST   /auth/logout                    — Cerrar sesión actual
 *   POST   /auth/logout-all                — Cerrar TODAS las sesiones
 *   POST   /auth/forgot-password           — Iniciar reset de contraseña
 *   POST   /auth/reset-password            — Completar reset con token de email
 *   POST   /auth/change-password           — Cambiar password autenticado
 *   POST   /auth/2fa/enroll                — Generar QR + secret de 2FA
 *   POST   /auth/2fa/confirm               — Confirmar enrollment (escaneó QR)
 *   POST   /auth/2fa/disable               — Deshabilitar 2FA
 *   POST   /auth/send-verification-email   — Solicitar nuevo email de verificación
 *   POST   /auth/verify-email              — Activar cuenta con token recibido
 *   GET    /auth/me                        — Obtener usuario actual
 *   GET    /auth/sessions                  — Listar sesiones activas
 *   DELETE /auth/sessions/:id              — Revocar sesión específica
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  // ============================================================
  // REGISTER + LOGIN
  // ============================================================

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.authService.register(dto, this.extractContext(req));
  }

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto, this.extractContext(req));
  }

  @Post("login/recovery")
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @HttpCode(HttpStatus.OK)
  async loginWithRecovery(@Body() dto: TwoFactorRecoveryDto, @Req() req: any) {
    return this.authService.loginWithRecoveryCode(
      dto,
      this.extractContext(req),
    );
  }

  /**
   * Server-to-server únicamente (BFF de ctgone.com o una app nativa con su
   * propia sesión Supabase) -- nunca un fetch directo desde una pestaña de
   * navegador, ver THREAT_MODEL.md § New trust boundary. Rate limit igual
   * de estricto que login: sigue siendo alcanzable por cualquiera que
   * tenga un access token de Supabase válido.
   */
  @Post("ctg-identity-exchange")
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async exchangeCtgIdentity(
    @Body() dto: CtgIdentityExchangeDto,
    @Req() req: any,
  ) {
    return this.authService.exchangeCtgIdentity(dto, this.extractContext(req));
  }

  // ============================================================
  // TOKEN MANAGEMENT
  // ============================================================

  @Post("refresh")
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: any) {
    return this.authService.refreshToken(
      dto.refreshToken,
      this.extractContext(req),
    );
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: any, @Body("refreshToken") refreshToken?: string) {
    await this.authService.logout(req.user.id, refreshToken);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Req() req: any) {
    return this.authService.logoutAllSessions(req.user.id);
  }

  // ============================================================
  // PASSWORD RESET (público) + CHANGE (autenticado)
  // ============================================================

  /**
   * Inicia el flujo de recuperación. Rate limit muy estricto:
   * 3 intentos por 15min por IP → mitiga email-enumeration y email-bombing.
   */
  @Post("forgot-password")
  @Throttle({ default: { limit: 3, ttl: seconds(900) } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any) {
    const ipAddress = this.extractContext(req).ipAddress;
    return this.passwordResetService.requestReset(dto.email, ipAddress);
  }

  /**
   * Completa el flujo: usuario llega del email con `token` + nueva password.
   * Rate limit medio: 5 intentos por 15min para tolerar tokens copiados mal.
   */
  @Post("reset-password")
  @Throttle({ default: { limit: 5, ttl: seconds(900) } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordResetService.resetPassword(dto.token, dto.newPassword);
    return {
      message:
        "Contraseña actualizada correctamente. Inicia sesión con tu nueva contraseña.",
    };
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  @HttpCode(HttpStatus.OK)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(req.user.id, dto);
    return { message: "Contraseña actualizada. Inicia sesión nuevamente." };
  }

  // ============================================================
  // 2FA (Google Authenticator / TOTP)
  // ============================================================

  /**
   * Inicia enrollment: genera secret + URI otpauth (QR).
   * El frontend convierte `otpauthUrl` en QR y guarda `encryptedSecret`
   * temporalmente para enviarlo en /confirm.
   */
  @Post("2fa/enroll")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async startTwoFactorEnrollment(@Req() req: any) {
    return this.authService.startTwoFactorEnrollment(req.user.id);
  }

  /**
   * Confirma enrollment: el cliente envía el primer código TOTP que genera
   * el autenticador + el `encryptedSecret` recibido en /enroll.
   * Si el código es válido, habilita 2FA y retorna 10 recovery codes.
   */
  @Post("2fa/confirm")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirmTwoFactorEnrollment(
    @Req() req: any,
    @Body() body: { encryptedSecret: string; code: string },
  ) {
    const { encryptedSecret, code } = body;
    if (!encryptedSecret || !code) {
      throw new Error("encryptedSecret y code son requeridos");
    }
    const result = await this.authService.confirmTwoFactorEnrollment(
      req.user.id,
      encryptedSecret,
      { code } as TwoFactorEnableDto,
    );
    return {
      ...result,
      message:
        "GUARDA estos códigos de recuperación en un lugar seguro. Cada uno funciona una sola vez en caso de perder tu autenticador.",
    };
  }

  @Post("2fa/disable")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async disableTwoFactor(@Req() req: any, @Body() dto: TwoFactorDisableDto) {
    await this.authService.disableTwoFactor(req.user.id, dto);
    return { message: "Autenticación de 2 factores deshabilitada." };
  }

  // ============================================================
  // EMAIL VERIFICATION
  // ============================================================

  /**
   * Solicita un nuevo email de verificación. Requiere autenticación
   * para evitar abuso (atacantes generando spam contra cualquier email).
   * Rate limit estricto: 3 emails por 15 min por IP.
   */
  @Post("send-verification-email")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: seconds(900) } })
  @HttpCode(HttpStatus.OK)
  async sendVerificationEmail(@Req() req: any) {
    const ctx = this.extractContext(req);
    return this.emailVerificationService.requestVerification(req.user.id, {
      ip: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Activa la cuenta consumiendo el token recibido por email.
   * Endpoint público (cualquiera con el link puede activar la cuenta).
   * Rate limit medio: 5 intentos por 15 min para tolerar copy-paste erróneo.
   */
  @Post("verify-email")
  @Throttle({ default: { limit: 5, ttl: seconds(900) } })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: any) {
    const ctx = this.extractContext(req);
    return this.emailVerificationService.verifyEmail(dto.token, {
      ip: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  // ============================================================
  // CURRENT USER + SESSION MGMT
  // ============================================================

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req: any) {
    return this.authService.getUserById(req.user.id);
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  async listSessions(@Req() req: any) {
    return this.authService.listSessions(req.user.id);
  }

  @Delete("sessions/:id")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(@Req() req: any, @Param("id") sessionId: string) {
    await this.authService.revokeSession(req.user.id, sessionId);
  }

  // ============================================================
  // INTERNAL
  // ============================================================

  private extractContext(req: any): { ipAddress?: string; userAgent?: string } {
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress;
    const userAgent = req.headers["user-agent"];
    return { ipAddress, userAgent };
  }
}
