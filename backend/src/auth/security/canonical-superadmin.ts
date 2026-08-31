import * as crypto from "crypto";
import { UserRole } from "@prisma/client";

/**
 * Canonical Nvet Care root identity.
 *
 * Authorization is pinned to the SHA-256 digest of one already-verified
 * CTG One / Supabase `sub`. The raw subject UUID is deliberately not kept in
 * source control. A caller cannot choose this value: `ctgUserId` is populated
 * only from a Supabase token whose signature/issuer/audience were verified by
 * CtgIdentityService.
 */
const CANONICAL_SUPERADMIN_SUBJECT_SHA256 =
  "4446b482e61fff7f0fcfc15f44983c2362e7f64aa32abd6c47b82e57f2d2de08";

function digestSubject(subject: string): Buffer {
  return crypto.createHash("sha256").update(subject, "utf8").digest();
}

function digestFromHex(hex: string): Buffer | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

export function isCanonicalNvetSuperadminSubject(
  ctgUserId: string | null | undefined,
  expectedDigestHex = CANONICAL_SUPERADMIN_SUBJECT_SHA256,
): boolean {
  if (!ctgUserId) return false;

  const expected = digestFromHex(expectedDigestHex);
  if (!expected) return false;

  const actual = digestSubject(ctgUserId);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Security invariant:
 * - the canonical verified CTG One identity is always SUPERADMIN;
 * - every other identity is incapable of acquiring SUPERADMIN authority,
 *   even if a database row is accidentally/manually labelled SUPERADMIN.
 */
export function resolveEffectiveNvetRole(
  user: { role: UserRole; ctgUserId?: string | null },
  expectedDigestHex = CANONICAL_SUPERADMIN_SUBJECT_SHA256,
): UserRole {
  if (isCanonicalNvetSuperadminSubject(user.ctgUserId, expectedDigestHex)) {
    return UserRole.SUPERADMIN;
  }

  return user.role === UserRole.SUPERADMIN ? UserRole.ADMIN : user.role;
}
