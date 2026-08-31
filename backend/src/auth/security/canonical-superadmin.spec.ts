import * as crypto from "crypto";
import { UserRole } from "@prisma/client";
import {
  isCanonicalNvetSuperadminSubject,
  resolveEffectiveNvetRole,
  resolveNvetRequestRole,
} from "./canonical-superadmin";

describe("canonical Nvet superadmin authorization", () => {
  const fixtureSubject = "11111111-1111-4111-8111-111111111111";
  const fixtureDigest = crypto
    .createHash("sha256")
    .update(fixtureSubject, "utf8")
    .digest("hex");

  it("promotes only the identity whose verified subject matches the pinned digest", () => {
    expect(
      resolveEffectiveNvetRole(
        { role: UserRole.CLIENT, ctgUserId: fixtureSubject },
        fixtureDigest,
      ),
    ).toBe(UserRole.SUPERADMIN);

    expect(
      resolveEffectiveNvetRole(
        {
          role: UserRole.CLIENT,
          ctgUserId: "22222222-2222-4222-8222-222222222222",
        },
        fixtureDigest,
      ),
    ).toBe(UserRole.CLIENT);
  });

  it("downgrades a non-canonical SUPERADMIN database label to ADMIN", () => {
    expect(
      resolveEffectiveNvetRole(
        {
          role: UserRole.SUPERADMIN,
          ctgUserId: "22222222-2222-4222-8222-222222222222",
        },
        fixtureDigest,
      ),
    ).toBe(UserRole.ADMIN);
  });

  it("lets only the canonical root enter request-scoped CLIENT mode", () => {
    expect(
      resolveNvetRequestRole(
        { role: UserRole.CLIENT, ctgUserId: fixtureSubject },
        UserRole.CLIENT,
        fixtureDigest,
      ),
    ).toBe(UserRole.CLIENT);

    expect(
      resolveNvetRequestRole(
        {
          role: UserRole.ADMIN,
          ctgUserId: "22222222-2222-4222-8222-222222222222",
        },
        UserRole.CLIENT,
        fixtureDigest,
      ),
    ).toBe(UserRole.ADMIN);
  });

  it("does not let the root switch into VET or any other privileged role", () => {
    const canonical = { role: UserRole.CLIENT, ctgUserId: fixtureSubject };

    expect(
      resolveNvetRequestRole(canonical, UserRole.VET, fixtureDigest),
    ).toBe(UserRole.SUPERADMIN);
    expect(
      resolveNvetRequestRole(canonical, UserRole.ADMIN, fixtureDigest),
    ).toBe(UserRole.SUPERADMIN);
    expect(
      resolveNvetRequestRole(canonical, UserRole.SUPERADMIN, fixtureDigest),
    ).toBe(UserRole.SUPERADMIN);
    expect(resolveNvetRequestRole(canonical, "CLIENT ", fixtureDigest)).toBe(
      UserRole.SUPERADMIN,
    );
  });

  it("fails closed for missing or malformed identity digests", () => {
    expect(isCanonicalNvetSuperadminSubject(null, fixtureDigest)).toBe(false);
    expect(isCanonicalNvetSuperadminSubject(fixtureSubject, "not-a-digest")).toBe(
      false,
    );
  });
});
