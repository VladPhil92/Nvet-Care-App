import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as crypto from "crypto";

const DEFAULT_MARKET = "Cartagena de Indias";
const SHA256_HEX = /^[a-f0-9]{64}$/;

@Injectable()
export class ClosedBetaAccessService {
  isEnabled(): boolean {
    return process.env.NVET_CLOSED_BETA_ENABLED === "true";
  }

  isBookingEnabled(): boolean {
    return process.env.NVET_BOOKING_ENABLED !== "false";
  }

  getMarket(): string {
    const configured = process.env.NVET_CLOSED_BETA_MARKET?.trim();
    return configured || DEFAULT_MARKET;
  }

  /**
   * Booking is the commercial boundary of the closed beta. Existing accounts
   * may still authenticate, recover access and manage their data while the
   * beta is enabled, but only invited clients can create new appointments.
   *
   * The cohort is stored as SHA-256 hashes of Nvet user IDs rather than raw
   * identifiers. If the beta flag is enabled without a valid cohort, the gate
   * fails closed so a configuration mistake cannot silently open production.
   */
  assertBookingAllowed(clientId: string, vetCity?: string | null): void {
    if (!this.isBookingEnabled()) {
      throw new ServiceUnavailableException({
        error: "BOOKING_TEMPORARILY_DISABLED",
        message:
          "Las nuevas reservas están temporalmente deshabilitadas por operación.",
      });
    }

    if (!this.isEnabled()) return;

    const cohort = this.getClientHashes();
    if (cohort.size === 0) {
      throw new ServiceUnavailableException({
        error: "CLOSED_BETA_COHORT_NOT_CONFIGURED",
        message:
          "La beta cerrada está habilitada pero su cohorte no está configurada.",
      });
    }

    const clientHash = this.hash(clientId);
    if (!cohort.has(clientHash)) {
      throw new ForbiddenException({
        error: "CLOSED_BETA_ACCESS_REQUIRED",
        message:
          "Esta cuenta todavía no está habilitada para reservar durante la beta cerrada de Cartagena.",
      });
    }

    if (!this.isMarketCity(vetCity)) {
      throw new ForbiddenException({
        error: "CLOSED_BETA_MARKET_RESTRICTED",
        message:
          "Durante la beta cerrada solo se pueden reservar veterinarios habilitados en Cartagena de Indias.",
      });
    }
  }

  getPublicPolicy() {
    return {
      phase: 12,
      mode: this.isEnabled() ? "closed-beta" : "standard",
      market: this.getMarket(),
      bookingEnabled: this.isBookingEnabled(),
      cohortConfigured: this.getClientHashes().size > 0,
    } as const;
  }

  private getClientHashes(): Set<string> {
    const raw = process.env.NVET_CLOSED_BETA_CLIENT_HASHES ?? "";
    return new Set(
      raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => SHA256_HEX.test(value)),
    );
  }

  private isMarketCity(value?: string | null): boolean {
    if (!value) return false;

    const city = this.normalizeLocation(value);
    const market = this.normalizeLocation(this.getMarket());

    if (city === market) return true;

    // Operational data may use either the municipal short name or the full
    // tourism/legal name. Accept both canonical Cartagena variants only.
    const cartagenaAliases = new Set([
      "cartagena",
      "cartagena de indias",
      "cartagena bolivar",
      "cartagena de indias bolivar",
    ]);

    return cartagenaAliases.has(city) && cartagenaAliases.has(market);
  }

  private normalizeLocation(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  private hash(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }
}
