import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, TransactionStatus, UserRole } from "@prisma/client";
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

function makeVetUser(overrides: Record<string, unknown> = {}) {
  return makeUser({
    role: UserRole.VET,
    vetProfile: {
      id: "vet-1",
      userId: "user-1",
      ctgBalance: 0,
    },
    ...overrides,
  });
}

describe("AccountLifecycleService", () => {
  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    appointment: { count: jest.fn() },
    transaction: { count: jest.fn(), aggregate: jest.fn() },
    vetWithdrawal: { count: jest.fn(), aggregate: jest.fn() },
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
  const mailService = { send: jest.fn() };

  const service = new AccountLifecycleService(
    prisma,
    passwordService as any,
    twoFactorService as any,
    auditService as any,
    mailService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-jwt-secret-at-least-thirty-two-bytes-long";
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
    prisma.appointment.count.mockResolvedValue(0);
    prisma.transaction.count.mockResolvedValue(0);
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amountCop: null, commissionAmount: null },
    });
    prisma.vetWithdrawal.count.mockResolvedValue(0);
    prisma.vetWithdrawal.aggregate.mockResolvedValue({
      _sum: { amountCop: null },
    });
    prisma.pet.findMany.mockResolvedValue([]);
    prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });
    prisma.notification.deleteMany.mockResolvedValue({ count: 0 });
    passwordService.verify.mockResolvedValue({ valid: true, needsRehash: false });
    mailService.send.mockResolvedValue({ ok: true, driver: "test" });
  });

  it("reports password re-authentication and no blockers for an eligible client", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.getDeletionReadiness("user-1");

    expect(result.canDelete).toBe(true);
    expect(result.reauthMethod).toBe("PASSWORD");
    expect(result.confirmationPhrase).toBe("ELIMINAR MI CUENTA");
  });

  it("checks CONFIRMED transactions as unresolved settlement obligations", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.transaction.count.mockResolvedValue(1);

    const result = await service.getDeletionReadiness("user-1");

    expect(result.canDelete).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNRESOLVED_TRANSACTIONS" }),
      ]),
    );
    expect(prisma.transaction.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: expect.arrayContaining([TransactionStatus.CONFIRMED]),
          },
        }),
      }),
    );
  });

  it("blocks a veterinarian while canonical liquidated COP remains withdrawable", async () => {
    prisma.user.findUnique.mockResolvedValue(makeVetUser());
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amountCop: 150000, commissionAmount: 15000 },
    });
    prisma.vetWithdrawal.aggregate.mockResolvedValue({
      _sum: { amountCop: 35000 },
    });

    const result = await service.getDeletionReadiness("user-1");

    expect(result.canDelete).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "WALLET_BALANCE" }),
      ]),
    );
  });

  it("runs final blocker validation inside the serializable deletion transaction", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    prisma.appointment.count.mockResolvedValue(1);

    await expect(
      service.deleteAccount("user-1", {
        confirmation: "ELIMINAR MI CUENTA",
        currentPassword: "correct-password",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("retries a serialization conflict before committing deletion", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());
    const serializationError = Object.assign(new Error("serialization"), {
      code: "P2034",
    });
    prisma.$transaction
      .mockRejectedValueOnce(serializationError)
      .mockImplementationOnce(async (callback: any) => callback(prisma));

    const result = await service.deleteAccount("user-1", {
      confirmation: "ELIMINAR MI CUENTA",
      currentPassword: "correct-password",
    });

    expect(result.deleted).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
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

  it("starts a web deletion request without disclosing account existence", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());

    const result = await service.requestExternalDeletion("ANA@example.com");

    expect(result.message).toContain("Si el correo corresponde");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "ana@example.com" },
      select: expect.any(Object),
    });
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.com",
        category: "account_deletion_request",
        text: expect.stringMatching(
          /Código de eliminación: \d{10}\.[a-f0-9]{32}/,
        ),
      }),
    );
  });

  it("returns the same web-request response for an unknown account", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.requestExternalDeletion("missing@example.com");

    expect(result.message).toContain("Si el correo corresponde");
    expect(mailService.send).not.toHaveBeenCalled();
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
