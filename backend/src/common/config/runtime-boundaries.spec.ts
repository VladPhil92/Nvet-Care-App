import {
  applyIdentityLaunchDefaults,
  resolveAllowedOrigins,
} from "./runtime-boundaries";

describe("runtime production boundaries", () => {
  describe("applyIdentityLaunchDefaults", () => {
    it("fails closed in production when identity exchange has no explicit provider URL", () => {
      const env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

      expect(() => applyIdentityLaunchDefaults(env)).toThrow(
        "NVET_CTG_SUPABASE_URL is required",
      );
    });

    it("allows the emergency disable switch without a provider URL", () => {
      const env = {
        NODE_ENV: "production",
        NVET_CTG_IDENTITY_EXCHANGE_DISABLED: "true",
      } as NodeJS.ProcessEnv;

      expect(() => applyIdentityLaunchDefaults(env)).not.toThrow();
      expect(env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED).toBe("false");
    });

    it("requires HTTPS for the production identity provider", () => {
      const env = {
        NODE_ENV: "production",
        NVET_CTG_SUPABASE_URL: "http://identity.example.test",
      } as NodeJS.ProcessEnv;

      expect(() => applyIdentityLaunchDefaults(env)).toThrow(
        "must use HTTPS in production",
      );
    });

    it("defaults identity exchange off in non-production when no provider is configured", () => {
      const env = { NODE_ENV: "test" } as NodeJS.ProcessEnv;

      applyIdentityLaunchDefaults(env);

      expect(env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED).toBe("false");
    });

    it("enables identity exchange in non-production when a provider is explicitly configured", () => {
      const env = {
        NODE_ENV: "staging",
        NVET_CTG_SUPABASE_URL: "https://staging-id.example.test",
      } as NodeJS.ProcessEnv;

      applyIdentityLaunchDefaults(env);

      expect(env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED).toBe("true");
    });

    it("rejects an explicit enabled flag without a provider URL", () => {
      const env = {
        NODE_ENV: "test",
        NVET_CTG_IDENTITY_EXCHANGE_ENABLED: "true",
      } as NodeJS.ProcessEnv;

      expect(() => applyIdentityLaunchDefaults(env)).toThrow(
        "NVET_CTG_SUPABASE_URL is required",
      );
    });
  });

  describe("resolveAllowedOrigins", () => {
    it("admits only explicitly configured production origins", () => {
      const env = {
        NODE_ENV: "production",
        CORS_ORIGINS: "https://ctgone.com, https://app.nvetcare.co/",
      } as NodeJS.ProcessEnv;

      expect(resolveAllowedOrigins(env)).toEqual([
        "https://ctgone.com",
        "https://app.nvetcare.co",
      ]);
    });

    it("fails closed when production CORS is not configured", () => {
      const env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

      expect(() => resolveAllowedOrigins(env)).toThrow(
        "must configure at least one production origin",
      );
    });

    it("rejects localhost origins in production", () => {
      const env = {
        NODE_ENV: "production",
        CORS_ORIGINS: "https://ctgone.com,http://localhost:5173",
      } as NodeJS.ProcessEnv;

      expect(() => resolveAllowedOrigins(env)).toThrow(
        "Production CORS must not allow localhost origins",
      );
    });

    it("keeps development localhost origins outside production", () => {
      const env = {
        NODE_ENV: "development",
        FRONTEND_URL: "https://preview.nvetcare.co",
      } as NodeJS.ProcessEnv;

      expect(resolveAllowedOrigins(env)).toEqual([
        "http://localhost:5173",
        "http://localhost:8081",
        "http://localhost:3001",
        "https://preview.nvetcare.co",
      ]);
    });
  });
});

