import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CoverageService } from "./coverage.service";
import {
  COLOMBIA_LAUNCH_MARKETS,
  LaunchMarketDefinition,
  MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
} from "./coverage.constants";

const CARTAGENA_DANE_CODE = "13001";

type MarketPolicyState =
  | "PRELAUNCH"
  | "EXPANSION_LOCKED"
  | "COVERAGE_BLOCKED"
  | "BOOKING_GATE_ELIGIBLE";

interface BookingPolicyInput {
  vetId?: string;
  serviceLatitude?: number;
  serviceLongitude?: number;
}

@Injectable()
export class MarketLaunchPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageService,
  ) {}

  isGuardEnabled(): boolean {
    if (process.env.NVET_MARKET_LAUNCH_GUARD_ENABLED === "false") return false;
    if (
      process.env.NODE_ENV === "test" &&
      process.env.NVET_MARKET_LAUNCH_GUARD_ENABLED !== "true"
    ) {
      return false;
    }
    return true;
  }

  isNationalExpansionEnabled(): boolean {
    return process.env.NVET_NATIONAL_EXPANSION_ENABLED === "true";
  }

  async assertBookingAllowed(input: BookingPolicyInput) {
    if (!this.isGuardEnabled()) {
      return { enforced: false } as const;
    }

    if (!input.vetId) {
      return { enforced: true, evaluated: false } as const;
    }

    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: input.vetId },
      select: {
        city: true,
        department: true,
      },
    });

    if (!vet) {
      return { enforced: true, evaluated: false } as const;
    }

    const vetMarket = this.coverage.resolveMarketByCity(vet.city, vet.department);
    if (!vetMarket) {
      throw new ForbiddenException({
        error: "VET_SERVICE_MARKET_UNSUPPORTED",
        message:
          "El veterinario seleccionado no pertenece a un mercado preparado por Nvet.",
      });
    }

    const serviceMarket =
      input.serviceLatitude != null && input.serviceLongitude != null
        ? this.coverage.resolveMarketForPoint(
            input.serviceLatitude,
            input.serviceLongitude,
          )?.market ?? null
        : null;

    const markets = this.uniqueMarkets(
      serviceMarket ? [vetMarket, serviceMarket] : [vetMarket],
    );

    for (const market of markets) {
      this.assertProviderAndExpansionPolicy(market);
    }

    const counts = await this.getGeoReadyVetCounts();
    for (const market of markets) {
      const geoReadyVets = counts.get(market.daneCode) ?? 0;
      if (geoReadyVets < MIN_VERIFIED_GEO_READY_VETS_PER_MARKET) {
        throw new ServiceUnavailableException({
          error: "MARKET_VET_COVERAGE_INSUFFICIENT",
          message: `La operación en ${market.city} todavía no tiene cobertura veterinaria mínima para aceptar reservas.`,
          market: {
            code: market.code,
            daneCode: market.daneCode,
            city: market.city,
            department: market.department,
          },
          geoReadyVets,
          minimumRequired: MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
        });
      }
    }

    return {
      enforced: true,
      evaluated: true,
      nationalExpansionEnabled: this.isNationalExpansionEnabled(),
      checkedMarkets: markets.map((market) => market.daneCode),
    } as const;
  }

  async getPolicySnapshot() {
    const catalog = this.coverage.getCatalog();
    const counts = await this.getGeoReadyVetCounts();
    const nationalExpansionEnabled = this.isNationalExpansionEnabled();

    const markets = COLOMBIA_LAUNCH_MARKETS.map((market) => {
      const providerRequested = this.coverage.isMarketActive(market);
      const expansionAllowed =
        market.daneCode === CARTAGENA_DANE_CODE || nationalExpansionEnabled;
      const geoReadyVets = counts.get(market.daneCode) ?? 0;
      const coverageSatisfied =
        geoReadyVets >= MIN_VERIFIED_GEO_READY_VETS_PER_MARKET;
      const bookingGateEligible =
        providerRequested && expansionAllowed && coverageSatisfied;

      let state: MarketPolicyState = "PRELAUNCH";
      if (providerRequested && !expansionAllowed) state = "EXPANSION_LOCKED";
      else if (providerRequested && !coverageSatisfied) state = "COVERAGE_BLOCKED";
      else if (bookingGateEligible) state = "BOOKING_GATE_ELIGIBLE";

      return {
        code: market.code,
        daneCode: market.daneCode,
        city: market.city,
        department: market.department,
        providerRequested,
        expansionAllowed,
        geoReadyVets,
        minimumRequired: MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
        coverageSatisfied,
        bookingGateEligible,
        state,
      } as const;
    });

    return {
      phase: 16,
      program: "market-launch-guard",
      country: "CO",
      guardEnabled: this.isGuardEnabled(),
      nationalExpansionEnabled,
      nationalExpansionSource: "NVET_NATIONAL_EXPANSION_ENABLED",
      marketActivationSource: catalog.activationSource,
      minimumGeoReadyVetsPerMarket: MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
      vetServiceAreaConsistencyRequired: true,
      cartagenaDaneCode: CARTAGENA_DANE_CODE,
      cartagenaDoesNotRequireNationalExpansionFlag: true,
      commercialLaunchAuthorized: false,
      markets,
      generatedAt: new Date().toISOString(),
    } as const;
  }

  private assertProviderAndExpansionPolicy(market: LaunchMarketDefinition) {
    if (!this.coverage.isMarketActive(market)) {
      throw new ForbiddenException({
        error: "SERVICE_MARKET_PRELAUNCH",
        message: `Nvet está preparando su operación en ${market.city}.`,
      });
    }

    if (
      market.daneCode !== CARTAGENA_DANE_CODE &&
      !this.isNationalExpansionEnabled()
    ) {
      throw new ForbiddenException({
        error: "NATIONAL_EXPANSION_LOCKED",
        message:
          "La expansión nacional de Nvet permanece bloqueada operativamente. Este mercado no puede aceptar reservas todavía.",
        market: {
          code: market.code,
          daneCode: market.daneCode,
          city: market.city,
        },
      });
    }
  }

  private async getGeoReadyVetCounts(): Promise<Map<string, number>> {
    const vets = await this.prisma.vetProfile.findMany({
      where: {
        isVerified: true,
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
        latitude: { not: null },
        longitude: { not: null },
        serviceRadius: { gt: 0 },
      },
      select: {
        city: true,
        department: true,
        latitude: true,
        longitude: true,
        serviceRadius: true,
      },
    });

    const counts = new Map<string, number>();
    for (const vet of vets) {
      const market = this.coverage.resolveMarketByCity(vet.city, vet.department);
      if (!market || !this.coverage.isVetServiceAreaConsistent(vet)) continue;
      counts.set(market.daneCode, (counts.get(market.daneCode) ?? 0) + 1);
    }
    return counts;
  }

  private uniqueMarkets(markets: LaunchMarketDefinition[]) {
    const byCode = new Map<string, LaunchMarketDefinition>();
    for (const market of markets) byCode.set(market.daneCode, market);
    return [...byCode.values()];
  }
}
