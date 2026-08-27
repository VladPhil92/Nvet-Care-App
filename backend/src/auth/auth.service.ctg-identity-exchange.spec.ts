import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';

/**
 * Tests focalizados en `exchangeCtgIdentity()` (Fases 2-3,
 * docs/identity/ADR-001 en ctg_one_website). CtgIdentityService se
 * mockea aquí -- su propia verificación JWKS real ya está cubierta por
 * ctg-identity.service.spec.ts.
 *
 * Escenarios:
 *  - Gate NVET_CTG_IDENTITY_EXCHANGE_ENABLED apagado → 404, sin verificar nada
 *  - Token de Supabase inválido → 401
 *  - Token sin claim email → 401 (no hay con qué provisionar)
 *  - ctgUserId sin User vinculado, sin colisión de email → provisiona CLIENT nuevo
 *  - ctgUserId sin User vinculado, email ya registrado → 401 CTG_IDENTITY_EMAIL_COLLISION, sin crear
 *  - Race en create() (P2002) resuelta por ctgUserId → sesión emitida igual
 *  - Race en create() (P2002) no resuelta por ctgUserId (chocó por email) → CTG_IDENTITY_EMAIL_COLLISION
 *  - User vinculado pero desactivado → 403
 *  - User con 2FA habilitado y sin código → 401 TWO_FACTOR_REQUIRED
 *  - User con 2FA habilitado y código correcto → sesión emitida
 *  - User vinculado, sin 2FA → sesión emitida (mismo shape que login())
 */
describe('AuthService.exchangeCtgIdentity', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let auditService: { log: jest.Mock };
  let ctgIdentityService: { verify: jest.Mock };
  let twoFactorService: { verifyDuringLogin: jest.Mock };
  let originalEnv: NodeJS.ProcessEnv;

  const CTG_USER_ID = '11111111-1111-4111-8111-111111111111';
  const CTG_EMAIL = 'newcomer@example.com';
  const LINKED_USER = {
    id: 'user-1',
    email: 'owner@example.com',
    role: 'CLIENT',
    ctgUserId: CTG_USER_ID,
    isActive: true,
    twoFactorEnabled: false,
    emailVerified: true,
    failedLoginAttempts: 0,
  };

  const uniqueConstraintError = () => {
    const err: any = new Error('Unique constraint failed');
    err.code = 'P2002';
    err.clientVersion = 'test';
    Object.setPrototypeOf(err, Prisma.PrismaClientKnownRequestError.prototype);
    return err;
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED = 'true';

    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
      userSession: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt'),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    ctgIdentityService = { verify: jest.fn() };
    twoFactorService = { verifyDuringLogin: jest.fn() };

    service = new AuthService(
      prisma,
      jwtService as any,
      {} as any, // passwordService — no usado en exchangeCtgIdentity
      twoFactorService as any,
      auditService as any,
      ctgIdentityService as any,
    );
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 404 without verifying the token when the gate is off', async () => {
    process.env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED = 'false';

    await expect(
      service.exchangeCtgIdentity({ supabaseAccessToken: 'whatever' } as any),
    ).rejects.toThrow(NotFoundException);

    expect(ctgIdentityService.verify).not.toHaveBeenCalled();
  });

  it('rejects an invalid Supabase token', async () => {
    ctgIdentityService.verify.mockRejectedValue(new Error('signature verification failed'));

    await expect(
      service.exchangeCtgIdentity({ supabaseAccessToken: 'bad-token' } as any),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects provisioning when the verified token has no email claim', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID }); // no email
    prisma.user.findUnique.mockResolvedValue(null); // ctgUserId lookup: unlinked

    await expect(
      service.exchangeCtgIdentity({ supabaseAccessToken: 'good-token' } as any),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });

  it('provisions a new CLIENT account for an unlinked ctgUserId with no email collision', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID, email: CTG_EMAIL });
    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.ctgUserId ? null : where.email ? null : null),
    );
    const created = {
      id: 'new-user-1',
      email: CTG_EMAIL,
      role: 'CLIENT',
      ctgUserId: CTG_USER_ID,
      isActive: true,
      twoFactorEnabled: false,
      emailVerified: true,
      failedLoginAttempts: 0,
    };
    prisma.user.create.mockResolvedValue(created);

    const result = await service.exchangeCtgIdentity({
      supabaseAccessToken: 'good-token',
    } as any);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: CTG_EMAIL,
          ctgUserId: CTG_USER_ID,
          role: 'CLIENT',
          emailVerified: true,
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'ctg_identity_provisioned' }),
    );
    expect(result.user.id).toBe('new-user-1');
    expect(result.requiresEmailVerification).toBe(false);
    expect(result.accessToken).toBe('signed.jwt');
  });

  it('rejects with CTG_IDENTITY_EMAIL_COLLISION when the email already belongs to another Nvet account', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID, email: CTG_EMAIL });
    prisma.user.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.ctgUserId ? null : where.email ? { ...LINKED_USER, email: CTG_EMAIL } : null),
    );

    await expect(
      service.exchangeCtgIdentity({ supabaseAccessToken: 'good-token' } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CTG_IDENTITY_EMAIL_COLLISION' }),
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('recovers from a concurrent create() race by re-reading the row a parallel exchange won', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID, email: CTG_EMAIL });
    const raceWinner = { ...LINKED_USER, id: 'race-winner', email: CTG_EMAIL };
    prisma.user.findUnique
      .mockResolvedValueOnce(null) // initial lookup by ctgUserId: unlinked
      .mockResolvedValueOnce(null) // provisionCtgUser's email collision check: none yet
      .mockResolvedValueOnce(raceWinner); // retry by ctgUserId after P2002: a parallel request won
    prisma.user.create.mockRejectedValue(uniqueConstraintError());

    const result = await service.exchangeCtgIdentity({
      supabaseAccessToken: 'good-token',
    } as any);

    expect(result.user.id).toBe('race-winner');
  });

  it('treats a create() race with no ctgUserId winner as an email collision', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID, email: CTG_EMAIL });
    prisma.user.findUnique
      .mockResolvedValueOnce(null) // initial lookup by ctgUserId: unlinked
      .mockResolvedValueOnce(null) // provisionCtgUser's email collision check: none yet
      .mockResolvedValueOnce(null); // retry by ctgUserId after P2002: still nobody -- the P2002 was on email
    prisma.user.create.mockRejectedValue(uniqueConstraintError());

    await expect(
      service.exchangeCtgIdentity({ supabaseAccessToken: 'good-token' } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'CTG_IDENTITY_EMAIL_COLLISION' }),
    });
  });

  it('rejects a linked but deactivated account', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID });
    prisma.user.findUnique.mockResolvedValue({ ...LINKED_USER, isActive: false });

    await expect(
      service.exchangeCtgIdentity({ supabaseAccessToken: 'good-token' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns TWO_FACTOR_REQUIRED when the linked account has 2FA enabled and no code was sent', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID });
    prisma.user.findUnique.mockResolvedValue({ ...LINKED_USER, twoFactorEnabled: true });

    await expect(
      service.exchangeCtgIdentity({ supabaseAccessToken: 'good-token' } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'TWO_FACTOR_REQUIRED' }),
    });

    expect(twoFactorService.verifyDuringLogin).not.toHaveBeenCalled();
  });

  it('mints a session when the linked account has 2FA enabled and the code is valid', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID });
    prisma.user.findUnique.mockResolvedValue({ ...LINKED_USER, twoFactorEnabled: true });
    twoFactorService.verifyDuringLogin.mockResolvedValue(undefined);

    const result = await service.exchangeCtgIdentity({
      supabaseAccessToken: 'good-token',
      twoFactorCode: '123456',
    } as any);

    expect(twoFactorService.verifyDuringLogin).toHaveBeenCalledWith(LINKED_USER.id, '123456');
    expect(result.accessToken).toBe('signed.jwt');
    expect(result.user.id).toBe(LINKED_USER.id);
  });

  it('mints a session for a linked account with no 2FA, same shape as login()', async () => {
    ctgIdentityService.verify.mockResolvedValue({ sub: CTG_USER_ID });
    prisma.user.findUnique.mockResolvedValue(LINKED_USER);

    const result = await service.exchangeCtgIdentity({
      supabaseAccessToken: 'good-token',
    } as any);

    expect(prisma.userSession.create).toHaveBeenCalled();
    expect(result.accessToken).toBe('signed.jwt');
    expect(result.refreshToken).toBe('signed.jwt');
    expect(result.user.id).toBe(LINKED_USER.id);
    expect(result.user.passwordHash).toBeUndefined();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'login_ctg_identity_exchange' }),
    );
  });
});
