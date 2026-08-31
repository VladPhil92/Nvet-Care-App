import { UserRole } from "@prisma/client";
import { AuthController } from "./auth.controller";

describe("AuthController.getCurrentUser role projection", () => {
  const makeController = (databaseRole: UserRole) => {
    const authService = {
      getUserById: jest.fn().mockResolvedValue({
        id: "user-1",
        email: "persona@nvetcare.test",
        role: databaseRole,
        ctgUserId: null,
        firstName: null,
        lastName: null,
        emailVerified: true,
        twoFactorEnabled: false,
      }),
    };

    return {
      controller: new AuthController(authService as any, {} as any, {} as any),
      authService,
    };
  };

  it.each([
    UserRole.CLIENT,
    UserRole.VET,
    UserRole.SUPERADMIN,
  ])("reports the effective %s role established by JwtStrategy", async (effectiveRole) => {
    // SUPERADMIN intentionally starts from a stale CLIENT database label here:
    // the request.user role is the post-JWT-boundary authority that dashboard
    // routing must observe. CLIENT/VET use their normal persisted labels.
    const databaseRole =
      effectiveRole === UserRole.SUPERADMIN ? UserRole.CLIENT : effectiveRole;
    const { controller, authService } = makeController(databaseRole);

    const result = await controller.getCurrentUser({
      user: { id: "user-1", role: effectiveRole },
    });

    expect(authService.getUserById).toHaveBeenCalledWith("user-1");
    expect(result.role).toBe(effectiveRole);
    expect(result.email).toBe("persona@nvetcare.test");
  });

  it("does not trust the persisted SUPERADMIN label when JwtStrategy downgraded it", async () => {
    const { controller } = makeController(UserRole.SUPERADMIN);

    const result = await controller.getCurrentUser({
      user: { id: "user-1", role: UserRole.ADMIN },
    });

    expect(result.role).toBe(UserRole.ADMIN);
  });
});
