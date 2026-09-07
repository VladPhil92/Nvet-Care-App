import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AccountLifecycleService } from "./account-lifecycle.service";

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "ana@example.com",
    passwordHash: "argon-hash",
    ctgUserId: null,
    role: UserRole.CLIENT,
    firstName: "Ana",
    lastName: "Pérez",
    phone: "+573001112233",
    avatar: null,
    ctgBalance: 0,
    emailVerified: true,
    emailVerificationTokenHash: null,
    emailVerificationExpiresAt: null,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    passwordChangedAt: new Date(),
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorEnrolledAt: null,
    recoveryCodesHash: [],
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    lastLoginUserAgent: null,
    isActive: true,
    deactivatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    vetProfile: null,
    ...overrides,
  };
}

describe("AccountLifecycleService", () => {
  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    appointment: { count: jest.fn() },
    transaction: { count: jest.fn() },
    vetWithdrawal: { count: jest.fn() },
    userSession: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    pet: {
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    price: { updateMany: jest.fn() },
    vetSchedule: { deleteMany: jest.fn() },
    scheduleException: { deleteMany: jest.fn() },
    vetProfile: { update: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
  };
  const passwordService = {
    verify: jest.fn(),
  };
  const twoFactorService = {
    verifyDuringLogin: jest.fn(),
  };
  const auditService = { log: jest.fn() };

  const service = new AccountLifecycleService(
    prisma,
    passwordService as any,
    twoFactorService as any,
    auditService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.appointment.count.mockResolvedValue(0);
    prisma.transaction.count.mockResolvedValue(0);
    prisma.vetWithdrawal.count.mockResolvedValue(0);
    prisma.pet.findMany.mockResolvedValue([]);
    prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });
    prisma.notification.deleteMany.mockResolvedValue({ count: 0 });
    passwordService.verify.mockResolvedValue({ valid: true, needsRehash: false });
  });

  it("reports password re-authentication and no blockers for an eligible client", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.getDeletionReadiness("user-1");

    expect(result.canDelete).toBe(true);
    expect(result.reauthMethod).toBe("PASSWORD");
    expect(result.confirmationPhrase).toBe("ELIMINAR MI CUENTA");
  });

  it("fails closed when operational or financial obligations remain", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.appointment.count.mockResolvedValueOnce(1);
    prisma.transaction.count.mockResolvedValueOnce(1);

    await expect(
      service.deleteAccount("user-1", {
        confirmation: "ELIMINAR MI CUENTA",
        currentPassword: "correct-password",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires the current password for local-password accounts", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());

    await expect(
      service.deleteAccount("user-1", {
        confirmation: "ELIMINAR MI CUENTA",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an incorrect current password", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    passwordService.verify.mockResolvedValue({ valid: false, needsRehash: false });

    await expect(
      service.deleteAccount("user-1", {
        confirmation: "ELIMINAR MI CUENTA",
        currentPassword: "wrong",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("pseudonymizes the account, removes sessions and preserves historical anchors", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.pet.findMany.mockResolvedValue([
      { id: "pet-empty", appointments: [] },
      { id: "pet-history", appointments: [{ id: "apt-1" }] },
    ]);

    const result = await service.deleteAccount("user-1", {
      confirmation: "ELIMINAR MI CUENTA",
      currentPassword: "correct-password",
    });

    expect(result.deleted).toBe(true);
    expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(prisma.pet.delete).toHaveBeenCalledWith({ where: { id: "pet-empty" } });
    expect(prisma.pet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pet-history" },
        data: expect.objectContaining({
          name: "Mascota eliminada",
          photo: null,
          notes: null,
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          email: "deleted+user-1@privacy.invalid",
          passwordHash: null,
          ctgUserId: null,
          phone: null,
          isActive: false,
        }),
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "self_service_account_deletion" }),
    );
  });
});
