import { BadRequestException } from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { GovernanceService } from "./governance.service";

function createService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    vetProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ...prismaOverrides,
  } as any;
  const auditService = { log: jest.fn() } as any;
  return {
    service: new GovernanceService(prisma, auditService),
    prisma,
    auditService,
  };
}

describe("GovernanceService", () => {
  it("fails closed when the root identity attempts to deactivate itself", async () => {
    const { service } = createService();

    await expect(
      service.updateUserStatus(
        "root-user",
        "root-user",
        { isActive: false, reason: "Intento de desactivación raíz" },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("never returns the raw CTG subject from the user governance listing", async () => {
    const { service, prisma } = createService();
    prisma.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        email: "user@example.com",
        role: "CLIENT",
        firstName: null,
        lastName: null,
        emailVerified: true,
        twoFactorEnabled: false,
        isActive: true,
        deactivatedAt: null,
        lastLoginAt: null,
        createdAt: new Date("2026-08-31T00:00:00.000Z"),
        ctgUserId: "00000000-0000-4000-8000-000000000001",
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const page = await service.getUsers({ limit: 25, offset: 0 });

    expect(page.results[0]).toMatchObject({ id: "user-1", ctgLinked: true });
    expect(page.results[0]).not.toHaveProperty("ctgUserId");
  });

  it("activates a veterinarian when SUPERADMIN approves verification", async () => {
    const { service, prisma } = createService();
    prisma.vetProfile.findUnique.mockResolvedValue({
      id: "vet-1",
      verificationStatus: VerificationStatus.IN_REVIEW,
      isVerified: false,
      isActive: false,
    });
    prisma.vetProfile.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "vet-1", ...data }),
    );

    const updated = await service.reviewVetVerification(
      "root-user",
      "vet-1",
      { decision: "APPROVE", reason: "Documentación profesional validada" },
    );

    expect(prisma.vetProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          verificationStatus: VerificationStatus.APPROVED,
          isVerified: true,
          isActive: true,
        }),
      }),
    );
    expect(updated.isActive).toBe(true);
  });

  it("deactivates a veterinarian while verification is rejected", async () => {
    const { service, prisma } = createService();
    prisma.vetProfile.findUnique.mockResolvedValue({
      id: "vet-1",
      verificationStatus: VerificationStatus.APPROVED,
      isVerified: true,
      isActive: true,
      isAvailableNow: true,
    });
    prisma.vetProfile.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "vet-1", ...data }),
    );

    await service.reviewVetVerification(
      "root-user",
      "vet-1",
      { decision: "REJECT", reason: "La documentación requiere corrección" },
    );

    expect(prisma.vetProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          verificationStatus: VerificationStatus.REJECTED,
          isVerified: false,
          isActive: false,
          isAvailableNow: false,
        }),
      }),
    );
  });
});
