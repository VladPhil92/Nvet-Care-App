import { BadRequestException } from "@nestjs/common";
import { ProfileService } from "./profile.service";

describe("ProfileService", () => {
  const profileRow = {
    id: "user-1",
    email: "persona@ctgone.test",
    ctgUserId: "5ad6d75c-92c4-4d42-907f-1a22a4f4fa9f",
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

  it("returns a public profile without exposing the raw CTG identity subject", async () => {
    prisma.user.findUnique.mockResolvedValue(profileRow);

    const result = await service.getClientProfile("user-1");

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
    expect(result).toEqual({
      id: profileRow.id,
      email: profileRow.email,
      firstName: profileRow.firstName,
      lastName: profileRow.lastName,
      phone: profileRow.phone,
      avatar: profileRow.avatar,
      emailVerified: profileRow.emailVerified,
      twoFactorEnabled: profileRow.twoFactorEnabled,
      createdAt: profileRow.createdAt,
      updatedAt: profileRow.updatedAt,
      identitySource: "CTG_ONE",
    });
    expect(result).not.toHaveProperty("ctgUserId");
    expect(result).not.toHaveProperty("role");
  });

  it("normalizes mutable fields and allows clearing the phone", async () => {
    prisma.user.update.mockResolvedValue({ ...profileRow, phone: null });

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

  it("rejects an empty mutation instead of emitting a fake profile update", async () => {
    await expect(service.updateClientProfile("user-1", {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it("re-checks minimum name length after trimming", async () => {
    await expect(
      service.updateClientProfile("user-1", { firstName: " A " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("audits field names without copying personal values", async () => {
    prisma.user.update.mockResolvedValue(profileRow);

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
