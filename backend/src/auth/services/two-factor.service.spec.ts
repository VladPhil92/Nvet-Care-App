import * as crypto from "crypto";
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { TwoFactorService } from "./two-factor.service";
import { PasswordService } from "./password.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";

// Independent RFC 6238 TOTP implementation used only to generate valid test
// codes for a known secret. Deliberately not shared with the service under
// test: if it agreed with a broken implementation, the tests would prove
// nothing. Two independent implementations of the same RFC producing
// matching codes is the actual assertion that the algorithm is correct.
function base32Decode(encoded: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of encoded.toUpperCase()) {
    const idx = alphabet.indexOf(char);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totpAt(secret: string, unixSeconds: number, digits = 6): string {
  const counter = Math.floor(unixSeconds / 30);
  const secretBytes = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", secretBytes).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

function currentCode(secret: string): string {
  return totpAt(secret, Date.now() / 1000);
}

describe("TwoFactorService", () => {
  const originalKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  let prisma: any;
  let passwordService: jest.Mocked<
    Pick<PasswordService, "hash" | "verify">
  >;
  let service: TwoFactorService;

  beforeAll(() => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = "test-encryption-key-do-not-use-in-prod";
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    else process.env.TWO_FACTOR_ENCRYPTION_KEY = originalKey;
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    passwordService = {
      hash: jest.fn().mockImplementation(async (v: string) => `hashed:${v}`),
      verify: jest.fn(),
    };
    service = new TwoFactorService(prisma, passwordService as any);
  });

  it("refuses to construct without any encryption key material", () => {
    const savedKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
    const savedJwt = process.env.JWT_SECRET;
    delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;

    expect(() => new TwoFactorService(prisma, passwordService as any)).toThrow(
      /TWO_FACTOR_ENCRYPTION_KEY o JWT_SECRET/,
    );

    process.env.TWO_FACTOR_ENCRYPTION_KEY = savedKey;
    if (savedJwt !== undefined) process.env.JWT_SECRET = savedJwt;
  });

  describe("startEnrollment", () => {
    it("refuses a nonexistent user", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.startEnrollment(USER_ID, "vet@example.com"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses to re-enroll an account that already has 2FA on", async () => {
      prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });
      await expect(
        service.startEnrollment(USER_ID, "vet@example.com"),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("returns a secret whose otpauth URL and encrypted form both round-trip", async () => {
      prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });

      const { secret, otpauthUrl, encryptedSecret } = await service.startEnrollment(
        USER_ID,
        "vet@example.com",
      );

      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(otpauthUrl).toContain("otpauth://totp/");
      expect(otpauthUrl).toContain(`secret=${secret}`);
      expect(otpauthUrl).toContain("vet%40example.com");
      // The encrypted secret must decrypt back to the same plaintext secret,
      // proven indirectly: a code computed from `secret` must verify once
      // enrollment is confirmed against `encryptedSecret`.
      const code = currentCode(secret);
      prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
      await expect(
        service.confirmEnrollment(USER_ID, encryptedSecret, code),
      ).resolves.toBeDefined();
    });

    it("never reuses a secret across two enrollment attempts", async () => {
      prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
      const first = await service.startEnrollment(USER_ID, "vet@example.com");
      const second = await service.startEnrollment(USER_ID, "vet@example.com");
      expect(first.secret).not.toBe(second.secret);
    });
  });

  describe("confirmEnrollment", () => {
    async function enroll() {
      prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
      return service.startEnrollment(USER_ID, "vet@example.com");
    }

    it("refuses an invalid TOTP code and persists nothing", async () => {
      const { encryptedSecret } = await enroll();

      await expect(
        service.confirmEnrollment(USER_ID, encryptedSecret, "000000"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("persists the secret, enables 2FA, and returns 10 unique recovery codes", async () => {
      const { secret, encryptedSecret } = await enroll();
      const code = currentCode(secret);

      const result = await service.confirmEnrollment(USER_ID, encryptedSecret, code);

      expect(result.recoveryCodes).toHaveLength(10);
      expect(new Set(result.recoveryCodes).size).toBe(10);
      expect(passwordService.hash).toHaveBeenCalledTimes(10);

      const [[updateArgs]] = prisma.user.update.mock.calls;
      expect(updateArgs).toEqual({
        where: { id: USER_ID },
        data: {
          twoFactorSecret: encryptedSecret,
          twoFactorEnabled: true,
          twoFactorEnrolledAt: expect.any(Date),
          recoveryCodesHash: result.recoveryCodes.map((c) => `hashed:${c}`),
        },
      });
    });

    it("accepts a code from one step in the past (clock-skew tolerance)", async () => {
      const { secret, encryptedSecret } = await enroll();
      const staleCode = totpAt(secret, Date.now() / 1000 - 30);

      await expect(
        service.confirmEnrollment(USER_ID, encryptedSecret, staleCode),
      ).resolves.toBeDefined();
    });

    it("refuses a code from two steps away, outside the tolerance window", async () => {
      const { secret, encryptedSecret } = await enroll();
      const farCode = totpAt(secret, Date.now() / 1000 - 90);

      await expect(
        service.confirmEnrollment(USER_ID, encryptedSecret, farCode),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("verifyDuringLogin", () => {
    it("refuses when the account has no 2FA enabled", async () => {
      prisma.user.findUnique.mockResolvedValue({
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });
      await expect(
        service.verifyDuringLogin(USER_ID, "123456"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses an invalid code for an enrolled account", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ twoFactorEnabled: false });
      const { encryptedSecret } = await service.startEnrollment(USER_ID, "v@e.com");
      prisma.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
      });

      await expect(
        service.verifyDuringLogin(USER_ID, "000000"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("accepts the correct current code for an enrolled account", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ twoFactorEnabled: false });
      const { secret, encryptedSecret } = await service.startEnrollment(
        USER_ID,
        "v@e.com",
      );
      prisma.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
      });

      await expect(
        service.verifyDuringLogin(USER_ID, currentCode(secret)),
      ).resolves.toBeUndefined();
    });

    it.each(["12345", "1234567", "abcdef", "12 3456"])(
      "refuses malformed code %p without touching the TOTP algorithm",
      async (code) => {
        prisma.user.findUnique.mockResolvedValueOnce({ twoFactorEnabled: false });
        const { encryptedSecret } = await service.startEnrollment(
          USER_ID,
          "v@e.com",
        );
        prisma.user.findUnique.mockResolvedValue({
          twoFactorEnabled: true,
          twoFactorSecret: encryptedSecret,
        });
        await expect(
          service.verifyDuringLogin(USER_ID, code),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      },
    );
  });

  describe("verifyRecoveryCode", () => {
    it("refuses when the account has no recovery codes left", async () => {
      prisma.user.findUnique.mockResolvedValue({ recoveryCodesHash: [] });
      await expect(
        service.verifyRecoveryCode(USER_ID, "ANYTHING12"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("refuses a code that matches none of the stored hashes", async () => {
      prisma.user.findUnique.mockResolvedValue({
        recoveryCodesHash: ["hash-a", "hash-b"],
      });
      passwordService.verify.mockResolvedValue({
        valid: false,
        isValid: false,
        needsRehash: false,
      });

      await expect(
        service.verifyRecoveryCode(USER_ID, "WRONGCODE1"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("consumes the matched code (single-use) and reports how many remain", async () => {
      prisma.user.findUnique.mockResolvedValue({
        recoveryCodesHash: ["hash-a", "hash-b", "hash-c"],
      });
      passwordService.verify.mockImplementation(async (_code, hash) => ({
        valid: hash === "hash-b",
        isValid: hash === "hash-b",
        needsRehash: false,
      }));

      const result = await service.verifyRecoveryCode(USER_ID, "THE-CODE-B");

      expect(result.remainingCodes).toBe(2);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { recoveryCodesHash: ["hash-a", "hash-c"] },
      });
    });

    it("stops checking once a match is found instead of scanning every hash", async () => {
      prisma.user.findUnique.mockResolvedValue({
        recoveryCodesHash: ["hash-a", "hash-b", "hash-c"],
      });
      passwordService.verify.mockImplementation(async (_code, hash) => ({
        valid: hash === "hash-a",
        isValid: hash === "hash-a",
        needsRehash: false,
      }));

      await service.verifyRecoveryCode(USER_ID, "THE-CODE-A");

      expect(passwordService.verify).toHaveBeenCalledTimes(1);
    });
  });

  describe("disable", () => {
    async function enrolledUser() {
      prisma.user.findUnique.mockResolvedValueOnce({ twoFactorEnabled: false });
      const { secret, encryptedSecret } = await service.startEnrollment(
        USER_ID,
        "v@e.com",
      );
      return { secret, encryptedSecret };
    }

    it("refuses when 2FA is not currently enabled", async () => {
      prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
      await expect(
        service.disable(USER_ID, "password", "123456"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses when the account somehow has no password hash to check against", async () => {
      prisma.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorSecret: "x",
        passwordHash: null,
      });
      await expect(
        service.disable(USER_ID, "password", "123456"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("refuses an incorrect password even with a valid TOTP code", async () => {
      const { secret, encryptedSecret } = await enrolledUser();
      prisma.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        passwordHash: "hash",
      });
      passwordService.verify.mockResolvedValue({
        valid: false,
        isValid: false,
        needsRehash: false,
      });

      await expect(
        service.disable(USER_ID, "wrong-password", currentCode(secret)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("refuses a correct password with an incorrect TOTP code", async () => {
      const { encryptedSecret } = await enrolledUser();
      prisma.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        passwordHash: "hash",
      });
      passwordService.verify.mockResolvedValue({
        valid: true,
        isValid: true,
        needsRehash: false,
      });

      await expect(
        service.disable(USER_ID, "correct-password", "000000"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("clears every 2FA field when both factors check out", async () => {
      const { secret, encryptedSecret } = await enrolledUser();
      prisma.user.findUnique.mockResolvedValue({
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        passwordHash: "hash",
      });
      passwordService.verify.mockResolvedValue({
        valid: true,
        isValid: true,
        needsRehash: false,
      });

      await service.disable(USER_ID, "correct-password", currentCode(secret));

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorEnrolledAt: null,
          recoveryCodesHash: [],
        },
      });
    });
  });
});
