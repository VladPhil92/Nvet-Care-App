import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as crypto from "crypto";

const VERSION = "v1";
const AAD = Buffer.from("nvet-financial-payout-destination-v1", "utf8");

export interface PayoutDestination {
  bankName?: string;
  accountNumber?: string;
  accountType?: "SAVINGS" | "CHECKING";
  phoneNumber?: string;
  documentId: string;
}

/**
 * Dedicated encryption boundary for payout destination data.
 *
 * Financial account data is never persisted as plaintext. Production requires
 * FINANCIAL_DATA_ENCRYPTION_KEY to be present. The key may be supplied as
 * base64(32 bytes) or as a high-entropy passphrase, which is domain-separated
 * with SHA-256 before use. The service intentionally refuses to fall back to
 * JWT_SECRET because rotating an authentication secret must never make payout
 * instructions undecryptable.
 */
@Injectable()
export class FinancialDataCryptoService {
  private readonly logger = new Logger(FinancialDataCryptoService.name);

  encrypt(destination: PayoutDestination): string {
    const key = this.getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(AAD);

    const plaintext = Buffer.from(JSON.stringify(destination), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(payload: string): PayoutDestination {
    const [version, ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(".");
    if (
      version !== VERSION ||
      !ivEncoded ||
      !tagEncoded ||
      !ciphertextEncoded
    ) {
      throw new ServiceUnavailableException({
        code: "FINANCIAL_DATA_INVALID",
        message: "Los datos de destino del retiro no pueden descifrarse.",
      });
    }

    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.getKey(),
        Buffer.from(ivEncoded, "base64url"),
      );
      decipher.setAAD(AAD);
      decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
      const clear = Buffer.concat([
        decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
        decipher.final(),
      ]);
      return JSON.parse(clear.toString("utf8")) as PayoutDestination;
    } catch (error) {
      this.logger.error(
        `Failed to decrypt financial payout destination: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException({
        code: "FINANCIAL_DATA_DECRYPTION_FAILED",
        message: "Los datos de destino del retiro no pueden descifrarse.",
      });
    }
  }

  fingerprint(destination: PayoutDestination): string {
    return crypto
      .createHmac("sha256", this.getKey())
      .update(this.canonicalize(destination), "utf8")
      .digest("hex");
  }

  mask(destination: PayoutDestination): string {
    const document = this.maskValue(destination.documentId, 4);
    if (destination.accountNumber) {
      const bank = destination.bankName?.trim() || "Cuenta bancaria";
      return `${bank} ••••${this.last(destination.accountNumber, 4)} · ID ${document}`;
    }
    if (destination.phoneNumber) {
      const label = destination.bankName?.trim() || "Billetera móvil";
      return `${label} ••••${this.last(destination.phoneNumber, 4)} · ID ${document}`;
    }
    return `Destino protegido · ID ${document}`;
  }

  private getKey(): Buffer {
    const source = process.env.FINANCIAL_DATA_ENCRYPTION_KEY?.trim();
    if (!source) {
      if (process.env.NODE_ENV === "test") {
        return crypto
          .createHash("sha256")
          .update("nvet-test-financial-data-encryption-key", "utf8")
          .digest();
      }
      throw new ServiceUnavailableException({
        code: "FINANCIAL_ENCRYPTION_KEY_NOT_CONFIGURED",
        message:
          "Los retiros están temporalmente deshabilitados hasta configurar el cifrado financiero dedicado.",
      });
    }

    try {
      const decoded = Buffer.from(source, "base64");
      if (decoded.length === 32 && decoded.toString("base64").replace(/=+$/, "") === source.replace(/=+$/, "")) {
        return decoded;
      }
    } catch {
      // Fall through to domain-separated derivation below.
    }

    if (source.length < 32) {
      throw new ServiceUnavailableException({
        code: "FINANCIAL_ENCRYPTION_KEY_WEAK",
        message: "La clave de cifrado financiero configurada no cumple la longitud mínima.",
      });
    }

    return crypto
      .createHash("sha256")
      .update(`nvet-financial-key-v1:${source}`, "utf8")
      .digest();
  }

  private canonicalize(destination: PayoutDestination): string {
    return JSON.stringify({
      accountNumber: destination.accountNumber?.trim() || null,
      accountType: destination.accountType || null,
      bankName: destination.bankName?.trim() || null,
      documentId: destination.documentId.trim(),
      phoneNumber: destination.phoneNumber?.trim() || null,
    });
  }

  private maskValue(value: string, visible: number): string {
    const clean = value.replace(/\s+/g, "");
    return `${"•".repeat(Math.max(0, clean.length - visible))}${this.last(clean, visible)}`;
  }

  private last(value: string, count: number): string {
    const clean = value.replace(/\s+/g, "");
    return clean.slice(-Math.min(count, clean.length));
  }
}
