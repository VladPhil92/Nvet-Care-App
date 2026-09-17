import { UserRole } from "@prisma/client";
import { hasAdminAuthority } from "./role-authority";

/**
 * This predicate is the inline counterpart to RolesGuard. If the two ever
 * disagree, the same dashboard action is allowed through a decorator and
 * refused through an ownership check (or the reverse), so every role is
 * asserted explicitly rather than by sampling.
 */
describe("hasAdminAuthority", () => {
  it("admits ADMIN", () => {
    expect(hasAdminAuthority(UserRole.ADMIN)).toBe(true);
  });

  it("admits SUPERADMIN, which inherits every ADMIN surface", () => {
    expect(hasAdminAuthority(UserRole.SUPERADMIN)).toBe(true);
  });

  it("refuses CLIENT", () => {
    expect(hasAdminAuthority(UserRole.CLIENT)).toBe(false);
  });

  it("refuses VET", () => {
    expect(hasAdminAuthority(UserRole.VET)).toBe(false);
  });

  it("refuses an absent role instead of failing open", () => {
    expect(hasAdminAuthority(undefined)).toBe(false);
  });

  it("refuses an unrecognized or spoofed role string", () => {
    for (const role of ["", "admin", "ADMIN ", "SUPER_ADMIN", "root"]) {
      expect(hasAdminAuthority(role)).toBe(false);
    }
  });

  it("covers every role in the enum, so a new role defaults to no authority", () => {
    const admitted = Object.values(UserRole).filter((role) =>
      hasAdminAuthority(role),
    );
    expect(admitted.sort()).toEqual(
      [UserRole.ADMIN, UserRole.SUPERADMIN].sort(),
    );
  });
});
