import * as crypto from 'crypto';
import {
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Tests focalizados en `refreshToken()` con reuse detection.
 *
 * Escenarios:
 *  - Caso normal: hash matchea sesión → rotation, history rolling
 *  - Reuse: hash matchea previousTokenHashes → revoca TODAS + audit CRITICAL
 *  - Hash totalmente desconocido → 401
 *  - Sesión revocada / expirada → 401
 *  - User inactive → 403
 *  - Token JWT inválido → 401
 *
 * No se prueba aquí: register/login/2FA/sessions list (otros specs).
 */
describe('AuthService.refreshToken (reuse detection)', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let auditService: { log: jest.Mock };

  const USER_ID = 'user-1';

  const hashOf = (token: string) =>
    crypto.createHash('sha256').update(token).digest('hex');

  beforeEach(() => {
    prisma = {
      userSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (ops: any) => ops),
    };

    jwtService = {
      verifyAsync: jest.fn(),
      signAsync: jest.fn(),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      prisma,
      jwtService as any,
      {} as any, // passwordService — no usado en refreshToken
      {} as any, // twoFactorService — no usado
      auditService as any,
    );
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
  });

  // -----------------------------------------------------------------
  // Validación previa del JWT
  // -----------------------------------------------------------------

  it('lanza BadRequestException si el refreshToken viene vacío', async () => {
    await expect(service.refreshToken('')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza UnauthorizedException si el JWT es inválido', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
    await expect(service.refreshToken('garbage.jwt.token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // -----------------------------------------------------------------
  // Caso normal: rotation
  // -----------------------------------------------------------------

  it('rotation exitosa: nuevo refresh + history rolling de hashes previos', async () => {
    const incomingToken = 'incoming.refresh.jwt';
    const incomingHash = hashOf(incomingToken);
    jwtService.verifyAsync.mockResolvedValue({ sub: USER_ID, type: 'refresh' });

    const session = {
      id: 'sess-1',
      refreshTokenHash: incomingHash,
      previousTokenHashes: ['old-hash-1', 'old-hash-2'],
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      ipAddress: null,
      userAgent: null,
      user: {
        id: USER_ID,
        isActive: true,
        emailVerified: true,
        twoFactorEnabled: false,
        role: 'CLIENT',
        email: 'u@x.co',
      },
    };
    prisma.userSession.findUnique.mockResolvedValue(session);
    // refreshToken() firma primero el refresh token y luego el access token.
    jwtService.signAsync
      .mockResolvedValueOnce('new.refresh.jwt')
      .mockResolvedValueOnce('new.access.jwt');

    const result = await service.refreshToken(incomingToken, {
      ipAddress: '1.1.1.1',
    });

    expect(result.accessToken).toBe('new.access.jwt');
    expect(result.refreshToken).toBe('new.refresh.jwt');

    // Update con history rolling: hash actual va al frente, los previos siguen
    const updateCall = prisma.userSession.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'sess-1' });
    expect(updateCall.data.previousTokenHashes).toEqual([
      incomingHash,
      'old-hash-1',
      'old-hash-2',
    ]);
    expect(updateCall.data.refreshTokenHash).toBe(hashOf('new.refresh.jwt'));

    // No reuse → no audit
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rotation: history se trunca a 5 hashes max', async () => {
    const incomingToken = 'incoming.jwt';
    const incomingHash = hashOf(incomingToken);
    jwtService.verifyAsync.mockResolvedValue({ sub: USER_ID, type: 'refresh' });

    const session = {
      id: 'sess-2',
      refreshTokenHash: incomingHash,
      previousTokenHashes: ['h1', 'h2', 'h3', 'h4', 'h5'], // ya 5
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      user: { id: USER_ID, isActive: true, role: 'CLIENT' },
    };
    prisma.userSession.findUnique.mockResolvedValue(session);
    jwtService.signAsync
      .mockResolvedValueOnce('new.refresh')
      .mockResolvedValueOnce('new.access');

    await service.refreshToken(incomingToken);

    const updateCall = prisma.userSession.update.mock.calls[0][0];
    // 1 (actual) + 5 previos = 6, debe truncarse a 5
    expect(updateCall.data.previousTokenHashes).toHaveLength(5);
    expect(updateCall.data.previousTokenHashes[0]).toBe(incomingHash);
    expect(updateCall.data.previousTokenHashes[4]).toBe('h4'); // se descarta h5
  });

  // -----------------------------------------------------------------
  // 🚨 REUSE DETECTION
  // -----------------------------------------------------------------

  it('detecta reuse: hash matchea previousTokenHashes → revoca TODAS + audit CRITICAL', async () => {
    const stolenToken = 'old.refresh.jwt';
    jwtService.verifyAsync.mockResolvedValue({ sub: USER_ID, type: 'refresh' });

    // Hash actual NO matchea (porque ya rotó)
    prisma.userSession.findUnique.mockResolvedValue(null);
    // Pero SÍ matchea en el historial de una sesión activa
    prisma.userSession.findFirst.mockResolvedValue({
      id: 'compromised-sess',
      userId: USER_ID,
    });
    prisma.userSession.updateMany.mockResolvedValue({ count: 3 });

    await expect(
      service.refreshToken(stolenToken, { ipAddress: '9.9.9.9' }),
    ).rejects.toThrow(UnauthorizedException);

    // Verifica que TODAS las sesiones del user fueron revocadas
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, revokedAt: null },
      data: expect.objectContaining({
        revokedAt: expect.any(Date),
        revokedReason: 'refresh_token_reuse_detected',
      }),
    });

    // Verifica audit CRITICAL
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TOKEN_REVOKED',
        severity: 'CRITICAL',
        targetType: 'UserSession',
        targetId: 'compromised-sess',
        reason: 'refresh_token_reuse_detected',
        metadata: expect.objectContaining({
          revokedSessionsCount: 3,
        }),
      }),
    );
  });

  // -----------------------------------------------------------------
  // Hash totalmente desconocido
  // -----------------------------------------------------------------

  it('hash que no matchea actual ni histórico → 401 sin revocar nada', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: USER_ID, type: 'refresh' });
    prisma.userSession.findUnique.mockResolvedValue(null);
    prisma.userSession.findFirst.mockResolvedValue(null); // tampoco en historial

    await expect(service.refreshToken('unknown.jwt')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // Sesión inválida / expirada / revocada
  // -----------------------------------------------------------------

  it('lanza UnauthorizedException si sesión está revokada', async () => {
    const incomingToken = 'token';
    jwtService.verifyAsync.mockResolvedValue({ sub: USER_ID, type: 'refresh' });
    prisma.userSession.findUnique.mockResolvedValue({
      id: 'sess',
      refreshTokenHash: hashOf(incomingToken),
      previousTokenHashes: [],
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000_000),
      user: { id: USER_ID, isActive: true },
    });

    await expect(service.refreshToken(incomingToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lanza UnauthorizedException si sesión está expirada', async () => {
    const incomingToken = 'token2';
    jwtService.verifyAsync.mockResolvedValue({ sub: USER_ID, type: 'refresh' });
    prisma.userSession.findUnique.mockResolvedValue({
      id: 'sess',
      refreshTokenHash: hashOf(incomingToken),
      previousTokenHashes: [],
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000), // expirada
      user: { id: USER_ID, isActive: true },
    });

    await expect(service.refreshToken(incomingToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lanza ForbiddenException si la cuenta está desactivada', async () => {
    const incomingToken = 'token3';
    jwtService.verifyAsync.mockResolvedValue({ sub: USER_ID, type: 'refresh' });
    prisma.userSession.findUnique.mockResolvedValue({
      id: 'sess',
      refreshTokenHash: hashOf(incomingToken),
      previousTokenHashes: [],
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1_000_000),
      user: { id: USER_ID, isActive: false },
    });

    await expect(service.refreshToken(incomingToken)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
