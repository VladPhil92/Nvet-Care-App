import { UserRole } from "@prisma/client";

/**
 * Request-level administrative authority. The canonical SUPERADMIN may enter
 * ADMIN surfaces, while CLIENT/VET (including root CLIENT-mode requests) do not.
 * Keep manual ownership checks aligned with RolesGuard so dashboard behavior
 * cannot diverge depending on whether an endpoint uses a decorator or an
 * inline ownership predicate.
 */
export function hasAdminAuthority(role: UserRole | string | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPERADMIN;
}
