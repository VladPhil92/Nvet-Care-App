import { AuthService } from './auth.service';

/**
 * register() nunca debe persistir role: ADMIN a partir de input del
 * cliente — ADMIN se aprovisiona fuera de banda (DB directa). RegisterDto
 * ya restringe los valores aceptados a CLIENT/VET (@IsIn), pero esta
 * prueba cubre el service en sí como segunda capa: si esa validación se
 * afloja alguna vez, este guard debe seguir bloqueando la escalada.
 */
describe('AuthService.register (role escalation guard)', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let passwordService: any;
  let auditService: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'new-user', emailVerified: false, ...data }),
        ),
      },
      userSession: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt'),
    };

    passwordService = {
      validateStrength: jest.fn().mockReturnValue({ valid: true, issues: [] }),
      hash: jest.fn().mockResolvedValue('hashed-password'),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      prisma,
      jwtService as any,
      passwordService as any,
      {} as any, // twoFactorService — no usado en register
      auditService as any,
      {} as any, // ctgIdentityService — no usado en register
    );
  });

  const baseDto = {
    email: 'attacker@example.com',
    password: 'Str0ng!Passw0rd123',
    firstName: 'Test',
    lastName: 'User',
  };

  it('nunca persiste role: ADMIN aunque el DTO lo traiga', async () => {
    await service.register({ ...baseDto, role: 'ADMIN' as any });

    const createCall = prisma.user.create.mock.calls[0][0];
    expect(createCall.data.role).toBe('CLIENT');
    expect(createCall.data.role).not.toBe('ADMIN');
  });

  it('permite role: VET (autorregistro legítimo)', async () => {
    await service.register({ ...baseDto, role: 'VET' as any });

    const createCall = prisma.user.create.mock.calls[0][0];
    expect(createCall.data.role).toBe('VET');
  });

  it('sin role explícito, persiste CLIENT por defecto', async () => {
    await service.register({ ...baseDto });

    const createCall = prisma.user.create.mock.calls[0][0];
    expect(createCall.data.role).toBe('CLIENT');
  });
});
