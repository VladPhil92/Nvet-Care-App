import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { BetaActivationService } from "./beta-activation.service";
import { BetaCohortService } from "./beta-cohort.service";
import { BetaLegalConsentService } from "./beta-legal-consent.service";

const DEFAULT_MARKET = "Cartagena de Indias";

@Injectable()
export class ClosedBetaAccessService {
  constructor(
    private readonly legalConsent?: BetaLegalConsentService,
    private readonly activation?: BetaActivationService,
    private readonly cohort?: BetaCohortService,
  ) {}

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

  async getConfiguredClientCount(): Promise<number> {
    return this.cohort ? this.cohort.getActiveCount() : 0;
  }

  /**
   * Booking is the commercial boundary of the closed beta. Existing accounts
   * may still authenticate, recover access and manage their data while the
   * beta is enabled, but new appointments require an explicit, time-bounded
   * operator authorization plus active cohort membership and legal consent.
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

    if (!this.activation) {
      throw new ServiceUnavailableException({
        error: "CLOSED_BETA_ACTIVATION_GATE_NOT_CONFIGURED",
        message:
          "La beta cerrada no puede aceptar reservas porque su autorización operacional no está configurada.",
      });
    }
    await this.activation.assertActiveForBooking();

    if (!this.cohort) {
      throw new ServiceUnavailableException({
        error: "CLOSED_BETA_COHORT_GATE_NOT_CONFIGURED",
        message:
          "La beta cerrada no puede aceptar reservas porque su control de cohorte no está configurado.",
      });
    }
    await this.cohort.assertActiveMember(clientId);

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

  async getPublicPolicy() {
    const configuredClients = await this.getConfiguredClientCount();
    return {
      phase: 12,
      mode: this.isEnabled() ? "closed-beta" : "standard",
      market: this.getMarket(),
      bookingEnabled: this.isBookingEnabled(),
      cohortConfigured: configuredClients > 0,
      cohortSource: "auditable-control-plane",
      legalAcceptanceRequired: this.isEnabled(),
      operatorAuthorizationRequired: this.isEnabled(),
    } as const;
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
}
