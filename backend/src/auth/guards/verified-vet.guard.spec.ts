import { ForbiddenException } from "@nestjs/common";
import { UserRole, VerificationStatus } from "@prisma/client";
import { VerifiedVetGuard } from "./verified-vet.guard";

describe("VerifiedVetGuard", () => {
  const request: any = {
    user: { id: "user-1", role: UserRole.VET },
  };
  const context: any = {
    switchToHttp: () => ({ getRequest: () => request }),
  };

  beforeEach(() => {
    request.user = { id: "user-1", role: UserRole.VET };
  });

  it("allows an active, document-approved vet with verified registry evidence", async () => {
    const prisma: any = {
      vetProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: "vet-1",
          isVerified: true,
          isActive: true,
          verificationStatus: VerificationStatus.APPROVED,
        }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ status: "VERIFIED" }]),
    };

    const guard = new VerifiedVetGuard(prisma);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.vetProfileId).toBe("vet-1");
    expect(request.user.professionalRegistryVerified).toBe(true);
  });

  it("blocks a self-selected VET before official registry verification", async () => {
    const prisma: any = {
      vetProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: "vet-1",
          isVerified: true,
          isActive: false,
          verificationStatus: VerificationStatus.APPROVED,
        }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };

    const guard = new VerifiedVetGuard(prisma);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("blocks non-VET role modes even if they carry platform authority", async () => {
    request.user = {
      id: "root-1",
      role: UserRole.CLIENT,
      authorityRole: UserRole.SUPERADMIN,
    };
    const prisma: any = {
      vetProfile: { findUnique: jest.fn() },
      $queryRawUnsafe: jest.fn(),
    };

    const guard = new VerifiedVetGuard(prisma);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.vetProfile.findUnique).not.toHaveBeenCalled();
  });
});
