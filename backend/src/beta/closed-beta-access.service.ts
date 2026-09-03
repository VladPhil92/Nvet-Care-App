import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { BetaLegalConsentService } from "./beta-legal-consent.service";

const DEFAULT_MARKET = "Cartagena de Indias";
const SHA256_HEX = /^[a-f0-9]{64}$/;

@Injectable()
export class ClosedBetaAccessService {
  constructor(private readonly legalConsent?: BetaLegalConsentService) {}

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

  getConfiguredClientCount(): number {
    return this.getClientHashes().size;
  }

  /**
   * Booking is the commercial boundary of the closed beta. Existing accounts
   * may still authenticate, recover access and manage their data while the
   * beta is enabled, but only invited clients with the current legal consent
   * can create new appointments.
   */
  async assertBookingAllowed(
    clientId: string,
    vetCity?: string | null,
  ): Promise<void> {
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

    if (!this.legalConsent) {
      throw new ServiceUnavailableException({
        error: "CLOSED_BETA_LEGAL_GATE_NOT_CONFIGURED",
        message:
          "La beta cerrada no puede aceptar reservas porque su gate legal no está configurado.",
      });
    }

    await this.legalConsent.assertCurrentAcceptance(clientId);
  }

  getPublicPolicy() {
    return {
      phase: 12,
      mode: this.isEnabled() ? "closed-beta" : "standard",
      market: this.getMarket(),
      bookingEnabled: this.isBookingEnabled(),
      cohortConfigured: this.getConfiguredClientCount() > 0,
      legalAcceptanceRequired: this.isEnabled(),
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
