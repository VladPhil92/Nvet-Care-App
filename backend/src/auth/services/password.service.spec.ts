import * as argon2 from "argon2";
import * as bcrypt from "bcrypt";
import { PasswordService } from "./password.service";

/**
 * No crypto here is mocked: hash() and verify() call the real argon2/bcrypt
 * libraries. A regression in this file is a regression in what actually
 * gates every login and password reset in production.
 */
describe("PasswordService", () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe("hash / verify round trip", () => {
    it("hashes with argon2id and verifies the same plaintext", async () => {
      const hash = await service.hash("Correct-Horse-Battery-9!");
      expect(hash).toMatch(/^\$argon2id\$/);

      const result = await service.verify("Correct-Horse-Battery-9!", hash);
      expect(result).toEqual({ valid: true, isValid: true, needsRehash: false });
    });

    it("refuses the wrong plaintext against a real hash", async () => {
      const hash = await service.hash("Correct-Horse-Battery-9!");
      const result = await service.verify("wrong-password", hash);
      expect(result.valid).toBe(false);
    });

    it("refuses to hash an empty password", async () => {
      await expect(service.hash("")).rejects.toThrow("Password no puede ser vacío");
    });
  });

  describe("verify — argument-order compatibility", () => {
    it("accepts the canonical (plaintext, hash) order", async () => {
      const hash = await argon2.hash("legacy-pw", {
        type: 2,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        hashLength: 32,
      });
      const result = await service.verify("legacy-pw", hash);
      expect(result.valid).toBe(true);
    });

    it("accepts the historical reversed (hash, plaintext) order", async () => {
      const hash = await argon2.hash("legacy-pw", {
        type: 2,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        hashLength: 32,
      });
      const result = await service.verify(hash, "legacy-pw");
      expect(result.valid).toBe(true);
    });

    it("treats two hash-shaped strings as not a valid pair rather than guessing", async () => {
      const hashA = await service.hash("password-a");
      const hashB = await service.hash("password-b");
      const result = await service.verify(hashA, hashB);
      expect(result.valid).toBe(false);
    });
  });

  describe("verify — missing input and unsupported formats", () => {
    it("refuses when the plaintext is empty", async () => {
      const hash = await service.hash("some-password");
      const result = await service.verify("", hash);
      expect(result).toEqual({ valid: false, isValid: false, needsRehash: false });
    });

    it("refuses when the hash is empty", async () => {
      const result = await service.verify("some-password", "");
      expect(result.valid).toBe(false);
    });

    it("refuses a hash format it does not recognize, rather than throwing", async () => {
      const result = await service.verify("password", "sha1:deadbeef");
      expect(result).toEqual({ valid: false, isValid: false, needsRehash: false });
    });

    it("does not throw on a corrupted argon2-looking hash", async () => {
      const result = await service.verify("password", "$argon2id$not-a-real-hash");
      expect(result.valid).toBe(false);
    });
  });

  describe("legacy bcrypt support", () => {
    it("verifies a real bcrypt hash and always flags it for rehash", async () => {
      const legacyHash = await bcrypt.hash("old-account-password", 10);
      const result = await service.verify("old-account-password", legacyHash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(true);
    });

    it("refuses the wrong plaintext against a bcrypt hash", async () => {
      const legacyHash = await bcrypt.hash("old-account-password", 10);
      const result = await service.verify("wrong", legacyHash);
      expect(result.valid).toBe(false);
    });

    it.each(["$2a", "$2b", "$2y"])(
      "recognizes the %s bcrypt prefix variant",
      async (prefix) => {
        const realHash = await bcrypt.hash("pw", 10);
        const reprefixed = prefix + realHash.slice(3);
        const result = await service.verify("pw", reprefixed);
        expect(result.valid).toBe(true);
      },
    );
  });

  describe("needsRehash", () => {
    it("flags an argon2 hash created with weaker-than-current parameters", async () => {
      const weakHash = await argon2.hash("password", {
        type: 2,
        memoryCost: 1024,
        timeCost: 2,
        parallelism: 1,
        hashLength: 32,
      });
      const result = await service.verify("password", weakHash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(true);
    });

    it("does not flag a hash created with current-or-stronger parameters", async () => {
      const strongHash = await argon2.hash("password", {
        type: 2,
        memoryCost: 131072,
        timeCost: 4,
        parallelism: 8,
        hashLength: 32,
      });
      const result = await service.verify("password", strongHash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(false);
    });
  });

  describe("validateStrength", () => {
    it("accepts a long, diverse password", () => {
      const result = service.validateStrength("Tr0ub4dor&3-Zebra!");
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it("refuses a password under 8 characters", () => {
      const result = service.validateStrength("Ab1!xyz");
      expect(result.valid).toBe(false);
      expect(result.issues).toContain("Mínimo 8 caracteres");
    });

    it("refuses a well-known common password even if long enough", () => {
      const result = service.validateStrength("password");
      expect(result.valid).toBe(false);
      expect(result.issues).toContain("Password demasiado común");
    });

    it("is case-insensitive when matching the common-password list", () => {
      const result = service.validateStrength("PaSsWoRd");
      expect(result.issues).toContain("Password demasiado común");
    });

    it("refuses a password that is one repeated character", () => {
      const result = service.validateStrength("aaaaaaaaaa");
      expect(result.valid).toBe(false);
      expect(result.issues).toContain("Demasiada repetición de caracteres");
    });

    it("flags a trivial numeric or alphabetic sequence", () => {
      const result = service.validateStrength("myPass123456!!");
      expect(result.issues).toContain("Contiene secuencia trivial");
    });

    it("keeps `valid` and `isValid` in sync, and `issues` and `reasons` in sync", () => {
      const result = service.validateStrength("weak");
      expect(result.isValid).toBe(result.valid);
      expect(result.reasons).toBe(result.issues);
    });

    it("never reports a negative score even after multiple penalties", () => {
      const result = service.validateStrength("password");
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it("caps the score at 4 regardless of how many criteria are met", () => {
      const result = service.validateStrength("Extremely-Long-And-Diverse-Passw0rd!#$%");
      expect(result.score).toBeLessThanOrEqual(4);
    });
  });
});
