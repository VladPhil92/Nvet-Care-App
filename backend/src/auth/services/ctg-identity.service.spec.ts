import { generateKeyPair, SignJWT } from 'jose';
import { CtgIdentityService } from './ctg-identity.service';

/**
 * Verifies CtgIdentityService against a real, locally generated key pair
 * (not the network) -- exercises jose's actual signature/issuer/audience/
 * expiration checks rather than mocking them away. See
 * docs/identity/ADR-001-unified-identity-for-nvet-care.md and
 * THREAT_MODEL.md (ctg_one_website) for the required test matrix.
 */
describe('CtgIdentityService', () => {
  const SUPABASE_URL = 'https://test-project.supabase.co';
  const ISSUER = `${SUPABASE_URL}/auth/v1`;
  const AUDIENCE = 'authenticated';
  const SUB = '11111111-1111-4111-8111-111111111111';

  let privateKey: any;
  let publicKey: any;
  let service: CtgIdentityService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair('ES256'));
  });

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NVET_CTG_SUPABASE_URL = SUPABASE_URL;
    process.env.NVET_CTG_SUPABASE_JWT_AUDIENCE = AUDIENCE;

    service = new CtgIdentityService();
    // Inject the local test key instead of hitting a real JWKS endpoint.
    (service as any).staticKeyForTesting = publicKey;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const sign = async (overrides: {
    issuer?: string;
    audience?: string;
    expiresIn?: string;
    sub?: string | null;
    email?: string;
  } = {}) => {
    const sub = overrides.sub === undefined ? SUB : overrides.sub;
    return new SignJWT({
      ...(sub !== null ? { sub } : {}),
      email: overrides.email ?? 'owner@example.com',
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience(overrides.audience ?? AUDIENCE)
      .setExpirationTime(overrides.expiresIn ?? '5m')
      .sign(privateKey);
  };

  it('accepts a valid token and returns its claims', async () => {
    const token = await sign();
    const claims = await service.verify(token);
    expect(claims.sub).toBe(SUB);
    expect(claims.email).toBe('owner@example.com');
  });

  it('rejects an expired token', async () => {
    const token = await sign({ expiresIn: '-1s' });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await sign({ issuer: 'https://attacker.example.com/auth/v1' });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await sign({ audience: 'not-authenticated' });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('rejects a token missing the sub claim', async () => {
    const token = await sign({ sub: null });
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('rejects a token signed by a different key (signature mismatch)', async () => {
    const { privateKey: otherPrivateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({ sub: SUB })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime('5m')
      .sign(otherPrivateKey);
    await expect(service.verify(token)).rejects.toThrow();
  });

  it('replay: a still-valid token can be exchanged more than once (no bespoke single-use nonce, per THREAT_MODEL.md)', async () => {
    const token = await sign();
    await expect(service.verify(token)).resolves.toMatchObject({ sub: SUB });
    await expect(service.verify(token)).resolves.toMatchObject({ sub: SUB });
  });
});
