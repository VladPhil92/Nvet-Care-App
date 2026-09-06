import { AuthService } from './auth.service';

describe('AuthService refresh-token issuance uniqueness', () => {
  let service: AuthService;
  let jwtService: { signAsync: jest.Mock };

  beforeEach(() => {
    jwtService = {
      signAsync: jest.fn().mockImplementation(async (payload) =>
        JSON.stringify(payload),
      ),
    };

    service = new AuthService(
      {} as any,
      jwtService as any,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
      {} as any,
    );
  });

  it('adds a distinct UUID jti to every refresh token emission', async () => {
    const user = { id: 'same-user' };
    const signRefreshToken = (service as any).signRefreshToken.bind(service);

    const first = await signRefreshToken(user);
    const second = await signRefreshToken(user);

    expect(first).not.toBe(second);
    expect(jwtService.signAsync).toHaveBeenCalledTimes(2);

    const firstPayload = jwtService.signAsync.mock.calls[0][0];
    const secondPayload = jwtService.signAsync.mock.calls[1][0];

    expect(firstPayload).toEqual(
      expect.objectContaining({
        sub: 'same-user',
        type: 'refresh',
        jti: expect.any(String),
      }),
    );
    expect(secondPayload).toEqual(
      expect.objectContaining({
        sub: 'same-user',
        type: 'refresh',
        jti: expect.any(String),
      }),
    );
    expect(firstPayload.jti).not.toBe(secondPayload.jti);
    expect(firstPayload.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(secondPayload.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
