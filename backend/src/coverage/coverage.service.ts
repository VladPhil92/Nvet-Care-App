import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  COLOMBIA_LAUNCH_MARKETS,
  DEFAULT_ACTIVE_SERVICE_MARKETS,
  LaunchMarketDefinition,
  MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
} from "./coverage.constants";

const EARTH_RADIUS_KM = 6371;

interface VetCoverageInput {
  city?: string | null;
  department?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  serviceRadius?: number | null;
}

interface BookingCoverageInput {
  serviceLatitude?: number;
  serviceLongitude?: number;
  vet: VetCoverageInput;
}

@Injectable()
export class CoverageService {
  constructor(private readonly prisma?: PrismaService) {}

  getCatalog() {
    const activeCodes = this.getActiveMarketDaneCodes();
    return {
      country: "CO",
      activationSource: "NVET_ACTIVE_SERVICE_MARKETS",
      activationRequiresCodeDeploy: false,
      bookingGeoEnforcement: this.isGeoBookingEnforced(),
      markets: COLOMBIA_LAUNCH_MARKETS.map((market) => ({
        code: market.code,
        daneCode: market.daneCode,
        city: market.city,
        department: market.department,
        countryCode: market.countryCode,
        status: activeCodes.has(market.daneCode) ? "ACTIVE" : "PRELAUNCH",
      })),
    } as const;
  }

  getPointCoverage(latitude: number, longitude: number) {
    this.assertCoordinates(latitude, longitude);
    const resolved = this.resolveMarketForPoint(latitude, longitude);

    if (!resolved) {
      return {
        country: "CO",
        supported: false,
        active: false,
        status: "UNSUPPORTED",
        message:
          "Nvet todavía no tiene una zona de lanzamiento configurada para esta ubicación.",
      } as const;
    }

    const active = this.isMarketActive(resolved.market);
    return {
      country: "CO",
      supported: true,
      active,
      status: active ? "ACTIVE" : "PRELAUNCH",
      market: this.toPublicMarket(resolved.market),
      distanceToMarketCenterKm: this.roundDistance(resolved.distanceKm),
      message: active
        ? `Nvet tiene cobertura de mercado activa en ${resolved.market.city}. La reserva final depende del radio del veterinario seleccionado.`
        : `Nvet está preparando su operación en ${resolved.market.city}.`,
    } as const;
  }

  resolveMarketByCity(
    city?: string | null,
    department?: string | null,
  ): LaunchMarketDefinition | null {
    if (!city) return null;
    const cityValue = this.normalizeLocation(city);
    const departmentValue = department
      ? this.normalizeLocation(department)
      : "";

    return (
      COLOMBIA_LAUNCH_MARKETS.find((market) => {
        const candidates = new Set([
          this.normalizeLocation(market.city),
          ...market.aliases.map((alias) => this.normalizeLocation(alias)),
          this.normalizeLocation(`${market.city} ${market.department}`),
        ]);

        if (candidates.has(cityValue)) return true;
        if (
          departmentValue &&
          candidates.has(`${cityValue} ${departmentValue}`)
        ) {
          return true;
        }
        return false;
      }) ?? null
    );
  }

  resolveMarketForPoint(latitude: number, longitude: number): {
    market: LaunchMarketDefinition;
    distanceKm: number;
  } | null {
    this.assertCoordinates(latitude, longitude);

    const candidates = COLOMBIA_LAUNCH_MARKETS.map((market) => ({
      market,
      distanceKm: this.calculateDistanceKm(
        latitude,
        longitude,
        market.latitude,
        market.longitude,
      ),
    }))
      .filter(({ market, distanceKm }) => distanceKm <= market.launchRadiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return candidates[0] ?? null;
  }

  /**
   * Commercial booking boundary for both the Cartagena launch and future
   * Colombian markets. Market activation is provider configuration, while the
   * final serviceability decision is always the selected vet's own radius.
   */
  assertBookableLocation(input: BookingCoverageInput) {
    if (!this.isGeoBookingEnforced()) {
      return { enforced: false } as const;
    }

    const { serviceLatitude, serviceLongitude, vet } = input;
    if (serviceLatitude == null || serviceLongitude == null) {
      throw new BadRequestException({
        error: "SERVICE_LOCATION_REQUIRED",
        message:
          "Necesitamos la ubicación del domicilio para confirmar que está dentro de la cobertura del veterinario.",
      });
    }
    this.assertCoordinates(serviceLatitude, serviceLongitude);

    const clientMarket = this.resolveMarketForPoint(
      serviceLatitude,
      serviceLongitude,
    );
    if (!clientMarket) {
      throw new ForbiddenException({
        error: "SERVICE_AREA_UNSUPPORTED",
        message:
          "Nvet todavía no tiene cobertura operativa configurada para este domicilio.",
      });
    }

    if (!this.isMarketActive(clientMarket.market)) {
      throw new ForbiddenException({
        error: "SERVICE_MARKET_PRELAUNCH",
        message: `Nvet está preparando su operación en ${clientMarket.market.city}.`,
        market: this.toPublicMarket(clientMarket.market),
      });
    }

    const vetMarket = this.resolveMarketByCity(vet.city, vet.department);
    if (!vetMarket) {
      throw new ForbiddenException({
        error: "VET_SERVICE_MARKET_UNSUPPORTED",
        message:
          "El veterinario seleccionado no pertenece a un mercado operativo configurado por Nvet.",
      });
    }

    if (!this.isMarketActive(vetMarket)) {
      throw new ForbiddenException({
        error: "VET_SERVICE_MARKET_PRELAUNCH",
        message: `El mercado del veterinario en ${vetMarket.city} todavía no está activo.`,
      });
    }

    const sameMarket = clientMarket.market.daneCode === vetMarket.daneCode;
    const sameMetro =
      Boolean(clientMarket.market.metroGroup) &&
      clientMarket.market.metroGroup === vetMarket.metroGroup;
    if (!sameMarket && !sameMetro) {
      throw new ForbiddenException({
        error: "CROSS_MARKET_BOOKING_NOT_ALLOWED",
        message:
          "El domicilio y el veterinario seleccionado no pertenecen a la misma zona de servicio activa.",
      });
    }

    if (vet.latitude == null || vet.longitude == null) {
      throw new ServiceUnavailableException({
        error: "VET_GEOLOCATION_NOT_CONFIGURED",
        message:
          "El veterinario todavía no tiene una ubicación de servicio validada para aceptar reservas a domicilio.",
      });
    }

    const serviceRadiusKm = vet.serviceRadius ?? 10;
    if (!Number.isFinite(serviceRadiusKm) || serviceRadiusKm <= 0) {
      throw new ServiceUnavailableException({
        error: "VET_SERVICE_RADIUS_NOT_CONFIGURED",
        message:
          "El veterinario todavía no tiene un radio de servicio válido configurado.",
      });
    }

    const distanceKm = this.calculateDistanceKm(
      serviceLatitude,
      serviceLongitude,
      vet.latitude,
      vet.longitude,
    );
    if (distanceKm > serviceRadiusKm) {
      throw new ForbiddenException({
        error: "OUTSIDE_VET_SERVICE_RADIUS",
        message:
          "El domicilio está fuera del radio de atención configurado por este veterinario.",
        distanceKm: this.roundDistance(distanceKm),
        serviceRadiusKm,
      });
    }

    return {
      enforced: true,
      market: this.toPublicMarket(clientMarket.market),
      distanceKm: this.roundDistance(distanceKm),
      serviceRadiusKm,
      metroCoverage: !sameMarket && sameMetro,
    } as const;
  }

  async getReadinessSnapshot() {
    const activeCodes = this.getActiveMarketDaneCodes();
    const vets = this.prisma
      ? await this.prisma.vetProfile.findMany({
          where: {
            isVerified: true,
            isActive: true,
            verificationStatus: VerificationStatus.APPROVED,
          },
          select: {
            city: true,
            department: true,
            latitude: true,
            longitude: true,
            serviceRadius: true,
          },
        })
      : [];

    const markets = COLOMBIA_LAUNCH_MARKETS.map((market) => {
      const marketVets = vets.filter(
        (vet) =>
          this.resolveMarketByCity(vet.city, vet.department)?.daneCode ===
          market.daneCode,
      );
      const geoReadyVets = marketVets.filter(
        (vet) =>
          vet.latitude != null &&
          vet.longitude != null &&
          Number.isFinite(vet.serviceRadius) &&
          Number(vet.serviceRadius) > 0,
      ).length;
      const coverageSatisfied =
        geoReadyVets >= MIN_VERIFIED_GEO_READY_VETS_PER_MARKET;
      const active = activeCodes.has(market.daneCode);

      return {
        ...this.toPublicMarket(market),
        status: active ? "ACTIVE" : "PRELAUNCH",
        verifiedActiveVets: marketVets.length,
        geoReadyVets,
        minimumGeoReadyVets: MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
        coverageSatisfied,
        launchEligible: coverageSatisfied,
        activeMarketOperationallyReady: active && coverageSatisfied,
      } as const;
    });

    const activeMarkets = markets.filter((market) => market.status === "ACTIVE");
    return {
      phase: 14,
      program: "colombia-service-coverage",
      country: "CO",
      activationSource: "NVET_ACTIVE_SERVICE_MARKETS",
      activationRequiresCodeDeploy: false,
      bookingGeoEnforcement: this.isGeoBookingEnforced(),
      minimumGeoReadyVetsPerMarket: MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
      activeMarketDaneCodes: [...activeCodes],
      allActiveMarketsReady:
        activeMarkets.length > 0 &&
        activeMarkets.every((market) => market.coverageSatisfied),
      markets,
      generatedAt: new Date().toISOString(),
    } as const;
  }

  isMarketActive(market: LaunchMarketDefinition): boolean {
    return this.getActiveMarketDaneCodes().has(market.daneCode);
  }

  isGeoBookingEnforced(): boolean {
    if (process.env.NVET_BOOKING_GEO_ENFORCEMENT === "false") return false;
    if (
      process.env.NODE_ENV === "test" &&
      process.env.NVET_BOOKING_GEO_ENFORCEMENT !== "true"
    ) {
      return false;
    }
    return true;
  }

  private getActiveMarketDaneCodes(): Set<string> {
    const configured = process.env.NVET_ACTIVE_SERVICE_MARKETS?.trim();
    const requested = configured
      ? configured
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [...DEFAULT_ACTIVE_SERVICE_MARKETS];

    const active = new Set<string>();
    for (const token of requested) {
      const normalized = this.normalizeLocation(token);
      const market = COLOMBIA_LAUNCH_MARKETS.find(
        (candidate) =>
          candidate.daneCode === token ||
          this.normalizeLocation(candidate.code) === normalized ||
          this.normalizeLocation(candidate.city) === normalized ||
          candidate.aliases.some(
            (alias) => this.normalizeLocation(alias) === normalized,
          ),
      );
      if (market) active.add(market.daneCode);
    }

    // Fail closed rather than silently enabling the whole catalog if provider
    // configuration contains only unknown values.
    return active;
  }

  private toPublicMarket(market: LaunchMarketDefinition) {
    return {
      code: market.code,
      daneCode: market.daneCode,
      city: market.city,
      department: market.department,
      countryCode: market.countryCode,
      metroGroup: market.metroGroup ?? null,
    } as const;
  }

  private assertCoordinates(latitude: number, longitude: number) {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException({
        error: "INVALID_SERVICE_COORDINATES",
        message: "Las coordenadas de servicio no son válidas.",
      });
    }
  }

  private calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private roundDistance(value: number): number {
    return Math.round(value * 10) / 10;
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
