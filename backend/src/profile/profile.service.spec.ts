import { ProfileService } from "./profile.service";

describe("ProfileService", () => {
  const profile = {
    id: "user-1",
    email: "persona@ctgone.test",
    ctgUserId: "5ad6d75c-92c4-4d42-907f-1a22a4f4fa9f",
    role: "CLIENT",
    firstName: "Ana",
    lastName: "Pérez",
    phone: "+573001112233",
    avatar: null,
    emailVerified: true,
    twoFactorEnabled: false,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const auditService = { log: jest.fn() };
  const service = new ProfileService(prisma as any, auditService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns only the authenticated user's client profile projection", async () => {
    prisma.user.findUnique.mockResolvedValue(profile);

    const result = await service.getClientProfile("user-1");

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
    expect(result).toEqual(profile);
  });

  it("normalizes mutable fields and allows clearing the phone", async () => {
    prisma.user.update.mockResolvedValue({ ...profile, phone: null });

    await service.updateClientProfile("user-1", {
      firstName: "  Ana María ",
      lastName: " Pérez ",
      phone: "",
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: {
          firstName: "Ana María",
          lastName: "Pérez",
          phone: null,
        },
      }),
    );
  });

  it("audits field names without copying personal values", async () => {
    prisma.user.update.mockResolvedValue(profile);

    await service.updateClientProfile("user-1", {
      phone: "+573009998877",
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "user-1",
        reason: "client_profile_updated",
        metadata: { changedFields: ["phone"] },
      }),
    );
    expect(JSON.stringify(auditService.log.mock.calls[0]?.[0])).not.toContain(
      "+573009998877",
    );
  });
});
