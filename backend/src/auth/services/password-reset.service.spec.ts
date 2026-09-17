import * as crypto from "crypto";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { AuditAction, AuditSeverity } from "@prisma/client";
import { PasswordResetService } from "./password-reset.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GENERIC_MESSAGE =
  "Si el email existe en nuestro sistema, recibirás instrucciones de recuperación en los próximos minutos.";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

describe("PasswordResetService", () => {
  let prisma: any;
  let passwordService: any;
  let auditService: any;
  let mailService: any;
  let service: PasswordResetService;

  beforeEach(() => {
    jest.useRealTimers();
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      userSession: { updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    passwordService = {
      validateStrength: jest.fn().mockReturnValue({ valid: true, issues: [] }),
      verify: jest.fn().mockResolvedValue({ valid: false }),
      hash: jest.fn().mockResolvedValue("new-hash"),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    mailService = {
      sendPasswordReset: jest.fn().mockResolvedValue({ ok: true, driver: "console" }),
    };
    service = new PasswordResetService(
      prisma,
      passwordService,
      auditService,
      mailService,
    );
  });

  // =========================================================================
  // requestReset — must never reveal whether an email exists
  // =========================================================================
  describe("requestReset", () => {
    it("returns the generic message for a nonexistent email without writing to the DB", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.requestReset("nobody@example.com");

      expect(result.message).toBe(GENERIC_MESSAGE);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it("returns the identical generic message for a deactivated account", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: "vet@example.com",
        isActive: false,
      });

      const result = await service.requestReset("vet@example.com");

      expect(result.message).toBe(GENERIC_MESSAGE);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it("normalizes the email (trim + lowercase) before the lookup", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestReset("  Vet@Example.COM  ");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "vet@example.com" },
        select: expect.any(Object),
      });
    });

    it("issues a token, persists only its hash, and emails the raw token", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: "vet@example.com",
        firstName: "Ana",
        isActive: true,
      });

      const result = await service.requestReset("vet@example.com", "10.0.0.1");

      expect(result.message).toBe(GENERIC_MESSAGE);

      const [updateArgs] = prisma.user.update.mock.calls[0];
      expect(updateArgs.where).toEqual({ id: USER_ID });
      expect(updateArgs.data.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(updateArgs.data.passwordResetExpiresAt).toBeInstanceOf(Date);

      const [mailArgs] = mailService.sendPasswordReset.mock.calls[0];
      expect(mailArgs.to).toBe("vet@example.com");
      const sentLink = new URL(mailArgs.resetLink);
      const sentToken = sentLink.searchParams.get("token")!;
      const [sentUserId, sentRawToken] = sentToken.split(".");
      expect(sentUserId).toBe(USER_ID);
      // The hash stored in the DB must match the raw token actually emailed —
      // if these ever diverge, every reset link sent would be unusable.
      expect(sha256(sentRawToken)).toBe(updateArgs.data.passwordResetTokenHash);
    });

    it("sets an expiry roughly 15 minutes out", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: "vet@example.com",
        isActive: true,
      });

      const before = Date.now();
      await service.requestReset("vet@example.com");
      const after = Date.now();

      const [updateArgs] = prisma.user.update.mock.calls[0];
      const expiresAt = updateArgs.data.passwordResetExpiresAt.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 15 * 60 * 1000);
    });

    it("logs a PASSWORD_RESET_REQUESTED audit event for a real dispatch", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: "vet@example.com",
        isActive: true,
      });

      await service.requestReset("vet@example.com", "10.0.0.1");

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { id: USER_ID, ip: "10.0.0.1" },
          action: AuditAction.PASSWORD_RESET_REQUESTED,
          severity: AuditSeverity.WARN,
          targetId: USER_ID,
        }),
      );
    });

    it("does not fail the request when the mail provider fails to send", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: "vet@example.com",
        isActive: true,
      });
      mailService.sendPasswordReset.mockResolvedValue({
        ok: false,
        driver: "sendgrid",
        error: "quota exceeded",
      });

      await expect(service.requestReset("vet@example.com")).resolves.toEqual({
        message: GENERIC_MESSAGE,
      });
    });
  });

  // =========================================================================
  // resetPassword — the actual credential-changing operation
  // =========================================================================
  describe("resetPassword", () => {
    function tokenFor(rawToken: string) {
      return `${USER_ID}.${rawToken}`;
    }

    it("refuses a token with no dot separator", async () => {
      await expect(
        service.resetPassword("not-a-valid-token", "New-Password9!"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("refuses a token with more than one dot", async () => {
      await expect(
        service.resetPassword("a.b.c", "New-Password9!"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses when the user (or its reset token) no longer exists", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword(tokenFor("raw"), "New-Password9!"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("refuses a token whose hash does not match the stored one", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        passwordResetTokenHash: sha256("the-real-token"),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        passwordHash: "old-hash",
      });

      await expect(
        service.resetPassword(tokenFor("a-forged-token"), "New-Password9!"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a correctly-hashed token that has expired", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        passwordResetTokenHash: sha256("raw"),
        passwordResetExpiresAt: new Date(Date.now() - 1000),
        passwordHash: "old-hash",
      });

      await expect(
        service.resetPassword(tokenFor("raw"), "New-Password9!"),
      ).rejects.toThrow(/expirado/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a weak new password before touching the token or the DB write", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        passwordResetTokenHash: sha256("raw"),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        passwordHash: "old-hash",
      });
      passwordService.validateStrength.mockReturnValue({
        valid: false,
        issues: ["Mínimo 8 caracteres"],
      });

      await expect(
        service.resetPassword(tokenFor("raw"), "weak"),
      ).rejects.toThrow(/Mínimo 8 caracteres/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses reusing the current password", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        passwordResetTokenHash: sha256("raw"),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        passwordHash: "old-hash",
      });
      passwordService.verify.mockResolvedValue({ valid: true });

      await expect(
        service.resetPassword(tokenFor("raw"), "Same-As-Before9!"),
      ).rejects.toThrow(/no puede ser igual a la anterior/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("allows setting a first password when the account never had one (CTG-provisioned)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        passwordResetTokenHash: sha256("raw"),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        passwordHash: null,
      });
      // passwordService.verify already defaults to { valid: false } — a null
      // stored hash has nothing to match, which is exactly what allows this.

      await expect(
        service.resetPassword(tokenFor("raw"), "Brand-New-Pass9!"),
      ).resolves.toBeUndefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("updates the password, clears the token, unlocks the account, and revokes sessions atomically", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        passwordResetTokenHash: sha256("raw"),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        passwordHash: "old-hash",
      });

      await service.resetPassword(tokenFor("raw"), "Brand-New-Pass9!");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [operations] = prisma.$transaction.mock.calls[0];
      expect(operations).toHaveLength(2);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          passwordHash: "new-hash",
          passwordChangedAt: expect.any(Date),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: "password_reset" },
      });
    });

    it("logs a CRITICAL PASSWORD_RESET_COMPLETED audit event on success", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        passwordResetTokenHash: sha256("raw"),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        passwordHash: "old-hash",
      });

      await service.resetPassword(tokenFor("raw"), "Brand-New-Pass9!");

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.PASSWORD_RESET_COMPLETED,
          severity: AuditSeverity.CRITICAL,
          targetId: USER_ID,
        }),
      );
    });
  });
});
