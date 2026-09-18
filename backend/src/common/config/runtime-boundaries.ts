type RuntimeEnv = NodeJS.ProcessEnv;

const DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8081",
  "http://localhost:3001",
] as const;

function parseBooleanFlag(
  value: string | undefined,
  name: string,
): boolean | null {
  if (value == null || value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function normalizeOrigin(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("CORS origin cannot be empty");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid CORS origin: ${value}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`CORS origin must use http or https: ${value}`);
  }
  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      `CORS origin must not include path, credentials, query or hash: ${value}`,
    );
  }

  return parsed.origin;
}

function isLocalOrigin(origin: string): boolean {
  const hostname = new URL(origin).hostname.toLowerCase();
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

/**
 * Fail-closed CTG One federation boundary.
 *
 * Production no longer inherits a hard-coded Supabase project. The provider
 * URL must be configured explicitly whenever identity exchange is enabled.
 * In non-production environments, identity exchange defaults to disabled when
 * no provider URL exists, avoiding accidental use of production identity.
 */
export function applyIdentityLaunchDefaults(
  env: RuntimeEnv = process.env,
): void {
  const emergencyDisabled = env.NVET_CTG_IDENTITY_EXCHANGE_DISABLED === "true";
  const configuredEnabled = parseBooleanFlag(
    env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED,
    "NVET_CTG_IDENTITY_EXCHANGE_ENABLED",
  );
  const providerUrl = env.NVET_CTG_SUPABASE_URL?.trim();

  if (emergencyDisabled) {
    env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED = "false";
    return;
  }

  const enabled =
    configuredEnabled ??
    (env.NODE_ENV === "production" ? true : Boolean(providerUrl));

  if (enabled && !providerUrl) {
    throw new Error(
      "NVET_CTG_SUPABASE_URL is required when CTG identity exchange is enabled",
    );
  }

  if (enabled && env.NODE_ENV === "production") {
    let parsed: URL;
    try {
      parsed = new URL(providerUrl!);
    } catch {
      throw new Error("NVET_CTG_SUPABASE_URL must be a valid URL");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("NVET_CTG_SUPABASE_URL must use HTTPS in production");
    }
  }

  env.NVET_CTG_IDENTITY_EXCHANGE_ENABLED = enabled ? "true" : "false";
}

/**
 * Resolve the exact browser origins admitted by the API.
 *
 * Production has no localhost fallback and fails closed without an explicit
 * CORS_ORIGINS/FRONTEND_URL configuration.
 */
export function resolveAllowedOrigins(env: RuntimeEnv = process.env): string[] {
  const configuredRaw = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(",")
    : env.FRONTEND_URL
      ? [env.FRONTEND_URL]
      : [];

  const configured = configuredRaw
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  if (env.NODE_ENV === "production") {
    if (configured.length === 0) {
      throw new Error(
        "CORS_ORIGINS or FRONTEND_URL must configure at least one production origin",
      );
    }

    const local = configured.find(isLocalOrigin);
    if (local) {
      throw new Error(
        `Production CORS must not allow localhost origins: ${local}`,
      );
    }

    return [...new Set(configured)];
  }

  return [...new Set([...DEVELOPMENT_ORIGINS, ...configured])];
}
