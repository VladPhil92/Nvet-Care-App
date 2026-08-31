import { BadRequestException } from "@nestjs/common";
import { GovernanceService } from "./governance.service";

function createService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    ...prismaOverrides,
  } as any;
  const auditService = { log: jest.fn() } as any;
  return { service: new GovernanceService(prisma, auditService), prisma, auditService };
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
});
