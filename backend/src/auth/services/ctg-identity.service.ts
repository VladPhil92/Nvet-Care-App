import { Injectable } from "@nestjs/common";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type KeyLike,
} from "jose";

/**
 * CtgIdentityService — verifies a Supabase-issued access token against
 * Supabase's own published JWKS (never a hardcoded key, never an
 * unverified decode). Implements the verification requirements in
 * docs/identity/ADR-001-unified-identity-for-nvet-care.md and
 * THREAT_MODEL.md (ctg_one_website): signature, issuer, audience and
 * expiration are all checked by `jwtVerify` itself — a mismatch on any
 * of them throws, which the caller must treat as "reject the exchange."
 */
export interface CtgIdentityClaims {
  sub: string;
  email?: string;
}

@Injectable()
export class CtgIdentityService {
  // Lazily created, then cached for the process lifetime.
  private remoteKeyResolver: JWTVerifyGetKey | null = null;

  // Test-only seam: when set, verify() uses this key directly instead of
  // fetching a real remote JWKS, so tests can exercise real signature
  // verification against a locally generated key pair.
  private staticKeyForTesting: KeyLike | Uint8Array | null = null;

  async verify(token: string): Promise<CtgIdentityClaims> {
    const supabaseUrl = this.requireEnv("NVET_CTG_SUPABASE_URL").replace(
      /\/+$/,
      "",
    );
    const audience =
      process.env.NVET_CTG_SUPABASE_JWT_AUDIENCE || "authenticated";
    const issuer = `${supabaseUrl}/auth/v1`;

    const { payload } = this.staticKeyForTesting
      ? await jwtVerify(token, this.staticKeyForTesting, { issuer, audience })
      : await jwtVerify(token, this.getRemoteKeyResolver(supabaseUrl), {
          issuer,
          audience,
        });

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new Error("Supabase token sin claim sub");
    }

    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  }

  private getRemoteKeyResolver(supabaseUrl: string): JWTVerifyGetKey {
    if (!this.remoteKeyResolver) {
      // jose caches fetched keys and only re-fetches (with a cooldown) when
      // an unrecognized `kid` shows up -- covers Supabase's signing-key
      // rotation without pinning a key. See THREAT_MODEL.md's Key
      // rotation entry.
      this.remoteKeyResolver = createRemoteJWKSet(
        new URL("/auth/v1/.well-known/jwks.json", supabaseUrl),
      );
    }
    return this.remoteKeyResolver;
  }

  private requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} no está configurada`);
    }
    return value;
  }
}
