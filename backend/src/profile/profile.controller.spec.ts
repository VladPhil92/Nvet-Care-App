import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ProfileController } from "./profile.controller";

describe("ProfileController effective-role boundary", () => {
  const profileService = {
    getClientProfile: jest.fn().mockResolvedValue({ id: "user-1" }),
    updateClientProfile: jest.fn().mockResolvedValue({ id: "user-1" }),
  };
  const controller = new ProfileController(profileService as any);

  beforeEach(() => jest.clearAllMocks());

  it("uses the authenticated JWT subject for reads", async () => {
    await controller.getClientProfile({
      user: { id: "user-1", role: UserRole.CLIENT },
    });

    expect(profileService.getClientProfile).toHaveBeenCalledWith("user-1");
  });

  it("uses the authenticated JWT subject for updates", async () => {
    await controller.updateClientProfile(
      { user: { id: "user-1", role: UserRole.CLIENT } },
      { firstName: "Ana" },
    );

    expect(profileService.updateClientProfile).toHaveBeenCalledWith("user-1", {
      firstName: "Ana",
    });
  });

  it.each([UserRole.VET, UserRole.ADMIN, UserRole.SUPERADMIN])(
    "fails closed outside effective CLIENT mode (%s)",
    async (role) => {
      await expect(
        controller.getClientProfile({ user: { id: "user-1", role } }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
