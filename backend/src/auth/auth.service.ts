import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { AuditAction, AuditSeverity, Prisma, UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { PasswordService } from './services/password.service';
import { TwoFactorService } from './services/two-factor.service';
import { CtgIdentityService } from './services/ctg-identity.service';
import {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  TwoFactorEnableDto,
  TwoFactorDisableDto,
  TwoFactorRecoveryDto,
  CtgIdentityExchangeDto,
} from './dto/auth.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * AuthService — flujo de autenticación production-grade.
 *
 * Protecciones activas:
 *  - Argon2id para password hashing (memoria 64MB, t=3, p=4)
 *  - Validación de fortaleza con anti-common-passwords y diversidad
 *  - Account lockout tras 5 intentos fallidos (15min)
 *  - Constant-time response sobre user-not-found vs wrong-password
 *  - Refresh tokens vinculados a sesión (UserSession) con revocación granular
 *  - 2FA TOTP enforcement durante login si está habilitado
 *  - Email único garantizado (case-insensitive a nivel aplicación)
 *  - passwordChangedAt invalida tokens anteriores
 *  - Migration automática de bcrypt → Argon2id en login exitoso
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly twoFactorService: TwoFactorService,
    private readonly auditService: AuditService,
    private readonly ctgIdentityService: CtgIdentityService,
  ) {}

  // ============================================================
  // REGISTER
  // ============================================================

  async register(dto: RegisterDto, ctx: LoginContext = {}) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Email único (case-insensitive a nivel app — el unique constraint de DB
    //    asume normalización aquí)
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException(
        'Este correo ya está registrado. ¿Olvidaste tu contraseña?',
      );
    }

    // 2. Validación EXTRA de fortaleza (anti common passwords + diversidad)
    const strength = this.passwordService.validateStrength(dto.password);
    if (!strength.isValid) {
      throw new BadRequestException(`Contraseña débil: ${strength.reasons.join(', ')}`);
    }

    // 3. Hash con Argon2id
    const passwordHash = await this.passwordService.hash(dto.password);

    // 4. Crear user
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        // Defense in depth: even if RegisterDto's role validation is ever
        // loosened, this path must never grant ADMIN from user input —
        // ADMIN is provisioned out-of-band only.
        role: dto.role === UserRole.ADMIN ? UserRole.CLIENT : dto.role || UserRole.CLIENT,
        passwordChangedAt: new Date(),
        // emailVerified: false (default)
      },
      include: { vetProfile: true },
    });

    // 5. Crear sesión + emitir tokens
    const tokens = await this.createSessionAndIssueTokens(user, ctx);

    // 6. Audit log: registro exitoso
    await this.auditService.log({
      actor: { id: user.id, role: user.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
      action: AuditAction.REGISTER_SUCCESS,
      severity: AuditSeverity.INFO,
      targetType: 'User',
      targetId: user.id,
      reason: 'user_registered',
      metadata: { role: user.role },
    });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
      requiresEmailVerification: !user.emailVerified,
    };
  }

  // ============================================================
  // LOGIN (con 2FA opcional)
  // ============================================================

  async login(dto: LoginDto, ctx: LoginContext = {}) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { vetProfile: true },
    });

    // 1. User-not-found vs wrong-password: respuesta indistinguible para
    //    prevenir user enumeration.
    //    Pero igual gastamos tiempo de verify (constant-time)
    if (!user) {
      // Hashear un dummy para igualar el tiempo
      await this.passwordService.verify(dto.password, '$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy');
      // Audit con email para detectar intentos sobre cuentas inexistentes
      await this.auditService.log({
        actor: { ip: ctx.ipAddress, userAgent: ctx.userAgent },
        action: AuditAction.LOGIN_FAILED,
        severity: AuditSeverity.WARN,
        reason: 'user_not_found',
        metadata: { emailAttempted: normalizedEmail },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Cuenta bloqueada por brute force
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      await this.auditService.log({
        actor: { id: user.id, role: user.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
        action: AuditAction.LOGIN_LOCKED,
        severity: AuditSeverity.WARN,
        targetType: 'User',
        targetId: user.id,
        reason: 'account_locked',
        metadata: { remainingMinutes },
      });
      throw new ForbiddenException(
        `Cuenta bloqueada por intentos fallidos. Reintenta en ${remainingMinutes} minutos o recupera tu contraseña.`,
      );
    }

    // 3. Cuenta desactivada
    if (!user.isActive) {
      throw new ForbiddenException('Esta cuenta está desactivada. Contacta soporte.');
    }

    // 3.b Cuenta provisionada vía CTG One sin password propio (ver
    // docs/identity/ADR-001 en ctg_one_website) — no hay nada que verificar
    // con este flujo de login.
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Esta cuenta no tiene contraseña configurada. Inicia sesión con tu cuenta CTG One o restablece tu contraseña.',
      );
    }

    // 4. Verificar password (con auto-rehash de bcrypt → Argon2id)
    const verifyResult = await this.passwordService.verify(dto.password, user.passwordHash);
    if (!verifyResult.isValid) {
      await this.recordFailedAttempt(user.id, user.failedLoginAttempts + 1);
      await this.auditService.log({
        actor: { id: user.id, role: user.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
        action: AuditAction.LOGIN_FAILED,
        severity: AuditSeverity.WARN,
        targetType: 'User',
        targetId: user.id,
        reason: 'wrong_password',
        metadata: { attempts: user.failedLoginAttempts + 1 },
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 4.b Migración automática a Argon2id si el hash era bcrypt
    if (verifyResult.needsRehash) {
      const newHash = await this.passwordService.hash(dto.password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
      this.logger.log(`Hash migrated bcrypt→Argon2id userId=${user.id}`);
    }

    // 5. 2FA enforcement
    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        // Indicar al cliente que falta TOTP
        throw new UnauthorizedException({
          message: 'Se requiere código del autenticador',
          error: 'TWO_FACTOR_REQUIRED',
          twoFactorEnabled: true,
        });
      }
      try {
        await this.twoFactorService.verifyDuringLogin(user.id, dto.twoFactorCode);
      } catch {
        await this.recordFailedAttempt(user.id, user.failedLoginAttempts + 1);
        await this.auditService.log({
          actor: { id: user.id, role: user.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
          action: AuditAction.LOGIN_FAILED,
          severity: AuditSeverity.WARN,
          targetType: 'User',
          targetId: user.id,
          reason: 'invalid_2fa_code',
        });
        throw new UnauthorizedException('Código del autenticador inválido o expirado');
      }
    }

    // 6. Login exitoso → reset failedAttempts + actualizar lastLogin
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ctx.ipAddress,
        lastLoginUserAgent: ctx.userAgent,
      },
    });

    // 7. Crear sesión + emitir tokens
    const tokens = await this.createSessionAndIssueTokens(user, ctx, dto.deviceLabel);

    // 8. Audit log: login exitoso
    await this.auditService.log({
      actor: { id: user.id, role: user.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
      action: AuditAction.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      targetType: 'User',
      targetId: user.id,
      reason: 'login_password_ok',
      metadata: {
        twoFactorUsed: user.twoFactorEnabled,
        deviceLabel: dto.deviceLabel ?? null,
      },
    });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
      requiresEmailVerification: !user.emailVerified,
    };
  }

  /**
   * Login alternativo cuando el usuario perdió el TOTP: usa un recovery code one-time.
   */
  async loginWithRecoveryCode(dto: TwoFactorRecoveryDto, ctx: LoginContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { vetProfile: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA no está habilitado');
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const verifyResult = await this.passwordService.verify(dto.password, user.passwordHash);
    if (!verifyResult.isValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const result = await this.twoFactorService.verifyRecoveryCode(user.id, dto.recoveryCode);

    const tokens = await this.createSessionAndIssueTokens(user, ctx, 'recovery');

    await this.auditService.log({
      actor: { id: user.id, role: user.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
      action: AuditAction.LOGIN_SUCCESS,
      severity: AuditSeverity.WARN, // recovery code = severity elevada
      targetType: 'User',
      targetId: user.id,
      reason: 'login_with_recovery_code',
      metadata: { remainingRecoveryCodes: result.remainingCodes },
    });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
      remainingRecoveryCodes: result.remainingCodes,
      warning:
        result.remainingCodes <= 3
          ? `Tienes solo ${result.remainingCodes} códigos de recuperación restantes. Genera nuevos en tu perfil.`
          : null,
    };
  }

  // ============================================================
  // CTG ONE IDENTITY EXCHANGE (docs/identity/ADR-001, ctg_one_website)
  // ============================================================

  /**
   * Intercambia un access token de Supabase (la identidad CTG One) por
   * una sesión Nvet normal, para un `User` ya vinculado por `ctgUserId`.
   *
   * Deliberadamente NO provisiona cuentas nuevas ni vincula por email
   * (eso es Fase 3/5) -- un `ctgUserId` sin `User` vinculado simplemente
   * no resuelve todavía. Todo lo posterior a la verificación reutiliza
   * el mismo camino de emisión de sesión que `login()`.
   *
   * Gateada por NVET_CTG_IDENTITY_EXCHANGE_ENABLED (default off): el
   * backend de este repo se despliega automáticamente en cada push a
   * `main`, así que sin este gate el endpoint quedaría alcanzable en
   * producción antes del lanzamiento anunciado (Fase 4). Ver
   * THREAT_MODEL.md § Deployed-but-not-yet-launched exposure.
   */
  async exchangeCtgIdentity(dto: CtgIdentityExchangeDto, ctx: LoginContext = {}) {
    if (process.env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED !== 'true') {
      throw new NotFoundException();
    }

    let ctgUserId: string;
    let ctgEmail: string | undefined;
    try {
      const claims = await this.ctgIdentityService.verify(dto.supabaseAccessToken);
      ctgUserId = claims.sub;
      ctgEmail = claims.email;
    } catch {
      await this.auditService.log({
        actor: { ip: ctx.ipAddress, userAgent: ctx.userAgent },
        action: AuditAction.NVET_IDENTITY_EXCHANGE_FAILURE,
        severity: AuditSeverity.WARN,
        reason: 'supabase_token_verification_failed',
      });
      throw new UnauthorizedException('Sesión de CTG One inválida o expirada');
    }

    let user = await this.prisma.user.findUnique({
      where: { ctgUserId },
      include: { vetProfile: true },
    });

    if (!user) {
      user = await this.provisionCtgUser(ctgUserId, ctgEmail, ctx);
    }

    // Misma regla que JwtStrategy para una sesión normal: una cuenta
    // desactivada no puede iniciar sesión por ningún camino, ni siquiera
    // con una sesión CTG One válida.
    if (!user.isActive) {
      throw new ForbiddenException('Esta cuenta está desactivada. Contacta soporte.');
    }

    // 2FA enforcement -- mismo shape que login(), reutilizando el mismo
    // servicio de verificación TOTP.
    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException({
          message: 'Se requiere código del autenticador',
          error: 'TWO_FACTOR_REQUIRED',
          twoFactorEnabled: true,
        });
      }
      try {
        await this.twoFactorService.verifyDuringLogin(user.id, dto.twoFactorCode);
      } catch {
        await this.auditService.log({
          actor: { id: user.id, role: user.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
          action: AuditAction.LOGIN_FAILED,
          severity: AuditSeverity.WARN,
          targetType: 'User',
          targetId: user.id,
          reason: 'invalid_2fa_code_ctg_identity_exchange',
        });
        throw new UnauthorizedException('Código del autenticador inválido o expirado');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ctx.ipAddress,
        lastLoginUserAgent: ctx.userAgent,
      },
    });

    const tokens = await this.createSessionAndIssueTokens(user, ctx);

    await this.auditService.log({
      actor: { id: user.id, role: user.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
      action: AuditAction.LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      targetType: 'User',
      targetId: user.id,
      reason: 'login_ctg_identity_exchange',
      metadata: { via: 'ctg_identity_exchange', twoFactorUsed: user.twoFactorEnabled },
    });

    return {
      user: this.sanitizeUser(user),
      ...tokens,
      requiresEmailVerification: !user.emailVerified,
    };
  }

  /**
   * Provisioning-on-first-visit (Fase 3, docs/identity/ADR-001 en
   * ctg_one_website): crea un `User` CLIENT nuevo para un `ctgUserId`
   * que todavía no tiene perfil de Nvet Care.
   *
   * Nunca vincula por email -- un email ya existente en Nvet (con o sin
   * password) responde apuntando al login existente, no crea la cuenta
   * ni la enlaza (la vinculación explícita y autenticada es Fase 5,
   * diferida indefinidamente; ver THREAT_MODEL.md § Account
   * linking/takeover).
   *
   * Race-safe: dos exchanges concurrentes para el mismo `ctgUserId` (o
   * un `POST /auth/register` concurrente con el mismo email) pueden
   * chocar contra el `create` -- se recupera reconsultando en vez de
   * fallar con un 500.
   */
  private async provisionCtgUser(ctgUserId: string, email: string | undefined, ctx: LoginContext) {
    if (!email) {
      await this.auditService.log({
        actor: { ip: ctx.ipAddress, userAgent: ctx.userAgent },
        action: AuditAction.NVET_IDENTITY_EXCHANGE_FAILURE,
        severity: AuditSeverity.WARN,
        reason: 'ctg_identity_missing_email_claim',
      });
      throw new UnauthorizedException('Sesión de CTG One inválida o expirada');
    }
    const normalizedEmail = email.trim().toLowerCase();

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingByEmail) {
      await this.auditService.log({
        actor: { ip: ctx.ipAddress, userAgent: ctx.userAgent },
        action: AuditAction.NVET_IDENTITY_EXCHANGE_FAILURE,
        severity: AuditSeverity.INFO,
        reason: 'ctg_identity_email_collision',
      });
      throw new UnauthorizedException({
        message:
          'Ya existe una cuenta de Nvet Care con este correo. Inicia sesión con tu contraseña o recupérala si la olvidaste.',
        error: 'CTG_IDENTITY_EMAIL_COLLISION',
      });
    }

    try {
      const created = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          ctgUserId,
          role: UserRole.CLIENT,
          // Supabase ya verificó este email -- no se re-verifica.
          emailVerified: true,
        },
        include: { vetProfile: true },
      });

      await this.auditService.log({
        actor: { id: created.id, role: created.role, ip: ctx.ipAddress, userAgent: ctx.userAgent },
        action: AuditAction.NVET_PROFILE_CREATED,
        severity: AuditSeverity.INFO,
        targetType: 'User',
        targetId: created.id,
        reason: 'ctg_identity_provisioned',
        metadata: { ctgUserId },
      });

      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Otro exchange concurrente (mismo ctgUserId) ya creó la fila.
        const raceWinner = await this.prisma.user.findUnique({
          where: { ctgUserId },
          include: { vetProfile: true },
        });
        if (raceWinner) {
          return raceWinner;
        }
        // El choque fue por email, no por ctgUserId -- alguien registró
        // ese correo en el mismo instante. Mismo resultado que la
        // colisión detectada arriba.
        await this.auditService.log({
          actor: { ip: ctx.ipAddress, userAgent: ctx.userAgent },
          action: AuditAction.NVET_IDENTITY_EXCHANGE_FAILURE,
          severity: AuditSeverity.INFO,
          reason: 'ctg_identity_email_collision_race',
        });
        throw new UnauthorizedException({
          message:
            'Ya existe una cuenta de Nvet Care con este correo. Inicia sesión con tu contraseña o recupérala si la olvidaste.',
          error: 'CTG_IDENTITY_EMAIL_COLLISION',
        });
      }
      throw err;
    }
  }

  // ============================================================
  // REFRESH TOKEN (con rotation y session validation)
  // ============================================================

  /**
   * Refresh access token con rotation + reuse detection.
   *
   * Defensa contra robo de refresh token (OAuth 2.0 Security BCP §2.2.2):
   *  1. Si el hash matchea una sesión activa → rotation normal.
   *  2. Si el hash NO matchea ninguna sesión actual pero SÍ matchea
   *     `previousTokenHashes` de alguna sesión → REUSE DETECTADO.
   *     → Revocar TODAS las sesiones del usuario afectado
   *     → Audit CRITICAL
   *     → 401 al cliente (lícito y atacante; ambos pierden acceso)
   *  3. Si el hash no matchea nada → token inválido (no robado, solo basura).
   */
  async refreshToken(refreshToken: string, ctx: LoginContext = {}) {
    if (!refreshToken) throw new BadRequestException('Refresh token requerido');

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const refreshTokenHash = this.hashToken(refreshToken);

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash },
      include: { user: { include: { vetProfile: true } } },
    });

    // ----- Caso A: Hash NO matchea ninguna sesión actual
    if (!session) {
      // ¿Será reuse de un token previamente rotado?
      // Buscamos en previousTokenHashes (Postgres array contains).
      const candidate = await this.prisma.userSession.findFirst({
        where: { previousTokenHashes: { has: refreshTokenHash } },
        select: { id: true, userId: true },
      });

      if (candidate) {
        // 🚨 REUSE DETECTADO — token robado o cliente buggy reenvío viejo.
        // Revocar TODAS las sesiones del usuario y alertar.
        await this.handleRefreshTokenReuse(
          candidate.userId,
          refreshTokenHash,
          candidate.id,
          ctx,
        );
        throw new UnauthorizedException(
          'Sesión revocada por seguridad. Inicia sesión nuevamente.',
        );
      }

      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    // ----- Caso B: Sesión existe pero ya fue revocada / expirada
    if (session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    if (!session.user.isActive) {
      throw new ForbiddenException('Cuenta desactivada');
    }

    // ----- Caso C: Rotation normal
    const newRefreshToken = await this.signRefreshToken(session.user);
    const newRefreshHash = this.hashToken(newRefreshToken);

    // Mantener últimos N hashes históricos para detectar reuse posterior.
    // 5 es suficiente: cualquier rotation realista no necesita más historial.
    const HISTORY_LIMIT = 5;
    const updatedHistory = [
      session.refreshTokenHash,
      ...(session.previousTokenHashes ?? []),
    ].slice(0, HISTORY_LIMIT);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshHash,
        previousTokenHashes: updatedHistory,
        lastUsedAt: new Date(),
        ipAddress: ctx.ipAddress ?? session.ipAddress,
        userAgent: ctx.userAgent ?? session.userAgent,
        expiresAt: this.refreshExpiresAt(),
      },
    });

    const accessToken = await this.signAccessToken(session.user);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Maneja el escenario de reuse: revoca TODAS las sesiones del usuario
   * (no solo la sospechosa) porque no podemos distinguir cuál es la lícita
   * y cuál es la robada. Mejor pecar de paranoico.
   */
  private async handleRefreshTokenReuse(
    userId: string,
    suspiciousHash: string,
    suspiciousSessionId: string,
    ctx: LoginContext,
  ): Promise<void> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: 'refresh_token_reuse_detected',
      },
    });

    this.logger.error(
      `🚨 REFRESH TOKEN REUSE detectado: userId=${userId} sessionId=${suspiciousSessionId} ` +
        `revokedSessions=${result.count} ip=${ctx.ipAddress ?? '-'}`,
    );

    await this.auditService.log({
      actor: { id: userId, ip: ctx.ipAddress, userAgent: ctx.userAgent },
      action: AuditAction.TOKEN_REVOKED,
      severity: AuditSeverity.CRITICAL,
      targetType: 'UserSession',
      targetId: suspiciousSessionId,
      reason: 'refresh_token_reuse_detected',
      metadata: {
        suspiciousHashPrefix: suspiciousHash.slice(0, 12),
        revokedSessionsCount: result.count,
      },
    });
  }

  // ============================================================
  // LOGOUT (con revocación real)
  // ============================================================

  async logout(userId: string, refreshToken?: string): Promise<void> {
    let revokedCount = 0;
    if (refreshToken) {
      const refreshTokenHash = this.hashToken(refreshToken);
      const r = await this.prisma.userSession.updateMany({
        where: { userId, refreshTokenHash, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'user_logout' },
      });
      revokedCount = r.count;
    } else {
      // Si no se pasa refresh token, revocar TODAS las sesiones (logout-all)
      const r = await this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'user_logout_all' },
      });
      revokedCount = r.count;
    }

    await this.auditService.log({
      actor: { id: userId },
      action: AuditAction.LOGOUT,
      severity: AuditSeverity.INFO,
      targetType: 'User',
      targetId: userId,
      reason: refreshToken ? 'session_logout' : 'session_logout_all',
      metadata: { revokedCount },
    });
  }

  async logoutAllSessions(userId: string): Promise<{ revoked: number }> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_logout_all' },
    });

    await this.auditService.log({
      actor: { id: userId },
      action: AuditAction.TOKEN_REVOKED,
      severity: AuditSeverity.WARN,
      targetType: 'User',
      targetId: userId,
      reason: 'all_sessions_revoked',
      metadata: { revokedCount: result.count },
    });

    return { revoked: result.count };
  }

  // ============================================================
  // CHANGE PASSWORD (autenticado)
  // ============================================================

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Esta cuenta no tiene contraseña configurada todavía. Usa "olvidé mi contraseña" para crear una.',
      );
    }

    const verifyResult = await this.passwordService.verify(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!verifyResult.isValid) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    const strength = this.passwordService.validateStrength(dto.newPassword);
    if (!strength.isValid) {
      throw new BadRequestException(`Contraseña débil: ${strength.reasons.join(', ')}`);
    }

    const sameAsCurrent = await this.passwordService.verify(dto.newPassword, user.passwordHash);
    if (sameAsCurrent.isValid) {
      throw new BadRequestException(
        'La nueva contraseña no puede ser igual a la actual',
      );
    }

    const newHash = await this.passwordService.hash(dto.newPassword);

    // Invalidar todas las sesiones excepto la actual no es trivial sin
    // el contexto del request. Por seguridad, invalidamos TODAS y forzamos re-login.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash, passwordChangedAt: new Date() },
      }),
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      }),
    ]);

    await this.auditService.log({
      actor: { id: userId },
      action: AuditAction.PASSWORD_CHANGED,
      severity: AuditSeverity.WARN,
      targetType: 'User',
      targetId: userId,
      reason: 'password_changed_self',
    });
  }

  // ============================================================
  // 2FA — fachada que delega en TwoFactorService
  // ============================================================

  async startTwoFactorEnrollment(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    return this.twoFactorService.startEnrollment(userId, user.email);
  }

  async confirmTwoFactorEnrollment(userId: string, encryptedSecret: string, dto: TwoFactorEnableDto) {
    const result = await this.twoFactorService.confirmEnrollment(
      userId,
      encryptedSecret,
      dto.code,
    );
    await this.auditService.log({
      actor: { id: userId },
      action: AuditAction.TWO_FACTOR_ENABLED,
      severity: AuditSeverity.WARN,
      targetType: 'User',
      targetId: userId,
      reason: 'two_factor_enabled',
    });
    return result;
  }

  async disableTwoFactor(userId: string, dto: TwoFactorDisableDto) {
    await this.twoFactorService.disable(userId, dto.password, dto.code);
    await this.auditService.log({
      actor: { id: userId },
      action: AuditAction.TWO_FACTOR_DISABLED,
      severity: AuditSeverity.CRITICAL,
      targetType: 'User',
      targetId: userId,
      reason: 'two_factor_disabled',
    });
  }

  // ============================================================
  // GET CURRENT USER
  // ============================================================

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    return this.sanitizeUser(user);
  }

  async listSessions(userId: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        deviceLabel: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions;
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'user_revoked' },
    });
    if (result.count > 0) {
      await this.auditService.log({
        actor: { id: userId },
        action: AuditAction.TOKEN_REVOKED,
        severity: AuditSeverity.INFO,
        targetType: 'UserSession',
        targetId: sessionId,
        reason: 'session_revoked_by_user',
      });
    }
  }

  // ============================================================
  // INTERNAL
  // ============================================================

  private async recordFailedAttempt(userId: string, attempts: number): Promise<void> {
    const data: any = { failedLoginAttempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      data.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      this.logger.warn(`Account lockout activated for userId=${userId} (${attempts} attempts)`);
    }
    await this.prisma.user.update({ where: { id: userId }, data });
  }

  private async createSessionAndIssueTokens(
    user: any,
    ctx: LoginContext,
    deviceLabel?: string,
  ) {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.signRefreshToken(user);
    const refreshTokenHash = this.hashToken(refreshToken);

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ipAddress,
        deviceLabel: deviceLabel ?? 'Dispositivo desconocido',
        expiresAt: this.refreshExpiresAt(),
      },
    });

    return { accessToken, refreshToken };
  }

  private async signAccessToken(user: any): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      },
    );
  }

  private async signRefreshToken(user: any): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, type: 'refresh' },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      },
    );
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiresAt(): Date {
    const days = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? '7', 10);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private sanitizeUser(user: any) {
    const {
      passwordHash,
      twoFactorSecret,
      recoveryCodesHash,
      passwordResetTokenHash,
      emailVerificationTokenHash,
      ...safe
    } = user;
    return safe;
  }
}
