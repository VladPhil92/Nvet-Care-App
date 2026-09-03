import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
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

const WEB_REFRESH_COOKIE = "nvet_refresh";
const WEB_SESSION_HEADER = "x-nvet-session-mode";
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
  async register(
    @Body() dto: RegisterDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.authService.register(
      dto,
      this.extractContext(req),
    );
    return this.finalizeSessionResponse(result, req, res);
  }

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.authService.login(dto, this.extractContext(req));
    return this.finalizeSessionResponse(result, req, res);
  }

  @Post("login/recovery")
  @Throttle({ default: { limit: 3, ttl: seconds(300) } })
  @HttpCode(HttpStatus.OK)
  async loginWithRecovery(
    @Body() dto: TwoFactorRecoveryDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.authService.loginWithRecoveryCode(
      dto,
      this.extractContext(req),
    );
    return this.finalizeSessionResponse(result, req, res);
  }

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

  /**
   * Native clients send refreshToken in the body. Browser dashboards opt into
   * cookie mode with X-Nvet-Session-Mode: cookie and never expose the refresh
   * token to JavaScript. Cookie mode requires the custom header so a third-party
   * page cannot silently use the refresh cookie without a CORS preflight.
   */
  @Post("refresh")
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const cookieMode = this.isCookieSession(req);
    const refreshToken =
      dto.refreshToken ||
      (cookieMode ? this.readCookie(req, WEB_REFRESH_COOKIE) : undefined);

    if (!refreshToken) {
      throw new BadRequestException("Refresh token requerido");
    }

    const result = await this.authService.refreshToken(
      refreshToken,
      this.extractContext(req),
    );
    return this.finalizeSessionResponse(result, req, res);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Body("refreshToken") refreshToken?: string,
  ) {
    const cookieToken = this.isCookieSession(req)
      ? this.readCookie(req, WEB_REFRESH_COOKIE)
      : undefined;
    await this.authService.logout(req.user.id, refreshToken || cookieToken);
    this.clearRefreshCookie(res);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const result = await this.authService.logoutAllSessions(req.user.id);
    this.clearRefreshCookie(res);
    return result;
  }

  // ============================================================
  // PASSWORD RESET + CHANGE
  // ============================================================

  @Post("forgot-password")
  @Throttle({ default: { limit: 3, ttl: seconds(900) } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: any) {
    const ipAddress = this.extractContext(req).ipAddress;
    return this.passwordResetService.requestReset(dto.email, ipAddress);
  }

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
  async changePassword(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(req.user.id, dto);
    this.clearRefreshCookie(res);
    return { message: "Contraseña actualizada. Inicia sesión nuevamente." };
  }

  // ============================================================
  // 2FA
  // ============================================================

  @Post("2fa/enroll")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async startTwoFactorEnrollment(@Req() req: any) {
    return this.authService.startTwoFactorEnrollment(req.user.id);
  }

  @Post("2fa/confirm")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirmTwoFactorEnrollment(
    @Req() req: any,
    @Body() body: { encryptedSecret: string; code: string },
  ) {
    const { encryptedSecret, code } = body;
    if (!encryptedSecret || !code) {
      throw new BadRequestException("encryptedSecret y code son requeridos");
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
    const user = await this.authService.getUserById(req.user.id);
    return { ...user, role: req.user.role };
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

  private finalizeSessionResponse(result: any, req: any, res: any) {
    if (!this.isCookieSession(req) || !result?.refreshToken) {
      return result;
    }

    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _refreshToken, ...browserSafeResult } = result;
    return browserSafeResult;
  }

  private isCookieSession(req: any): boolean {
    return (
      String(req.headers?.[WEB_SESSION_HEADER] || "").toLowerCase() === "cookie"
    );
  }

  private setRefreshCookie(res: any, refreshToken: string): void {
    const production = process.env.NODE_ENV === "production";
    res.cookie(WEB_REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: production,
      sameSite: production ? "none" : "lax",
      path: "/api/auth",
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
  }

  private clearRefreshCookie(res: any): void {
    const production = process.env.NODE_ENV === "production";
    res.clearCookie(WEB_REFRESH_COOKIE, {
      httpOnly: true,
      secure: production,
      sameSite: production ? "none" : "lax",
      path: "/api/auth",
    });
  }

  private readCookie(req: any, name: string): string | undefined {
    const raw = String(req.headers?.cookie || "");
    for (const part of raw.split(";")) {
      const [key, ...valueParts] = part.trim().split("=");
      if (key === name) {
        const value = valueParts.join("=");
        return value ? decodeURIComponent(value) : undefined;
      }
    }
    return undefined;
  }

  private extractContext(req: any): { ipAddress?: string; userAgent?: string } {
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress;
    const userAgent = req.headers["user-agent"];
    return { ipAddress, userAgent };
  }
}
