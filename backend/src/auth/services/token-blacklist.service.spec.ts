import { TokenBlacklistService } from "./token-blacklist.service";

describe("TokenBlacklistService runtime contract", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("constructs safely with REDIS_URL using the declared redis dependency", async () => {
    process.env.NODE_ENV = "production";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";

    const service = new TokenBlacklistService();

    expect(service).toBeDefined();
    await service.onModuleDestroy();
  });

  it("keeps the in-memory fallback when REDIS_URL is absent", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.REDIS_URL;

    const service = new TokenBlacklistService();
    await service.revoke("test-jti", 30);

    await expect(service.isRevoked("test-jti")).resolves.toBe(true);
    await service.onModuleDestroy();
  });
});
