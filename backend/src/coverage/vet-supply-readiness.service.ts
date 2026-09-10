import { Injectable } from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  COLOMBIA_LAUNCH_MARKETS,
  MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
} from "./coverage.constants";
import { CoverageService } from "./coverage.service";

type SupplyStage =
  | "ACQUISITION_REQUIRED"
  | "SERVICE_AREA_REQUIRED"
  | "VERIFICATION_REQUIRED"
  | "VERIFICATION_IN_PROGRESS"
  | "COVERAGE_GAP"
  | "SUPPLY_READY";

interface SupplyProfile {
  city: string | null;
  department: string | null;
  latitude: number | null;
  longitude: number | null;
  serviceRadius: number;
  isVerified: boolean;
  isActive: boolean;
  verificationStatus: VerificationStatus;
}

@Injectable()
export class VetSupplyReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageService,
  ) {}

  async getSupplyFunnelSnapshot() {
    const profiles = await this.prisma.vetProfile.findMany({
      select: {
        city: true,
        department: true,
        latitude: true,
        longitude: true,
        serviceRadius: true,
        isVerified: true,
        isActive: true,
        verificationStatus: true,
      },
    });

    const markets = COLOMBIA_LAUNCH_MARKETS.map((market) => {
      const marketProfiles = profiles.filter(
        (profile) =>
          this.coverage.resolveMarketByCity(profile.city, profile.department)
            ?.daneCode === market.daneCode,
      );

      const serviceAreaComplete = marketProfiles.filter((profile) =>
        this.hasServiceArea(profile),
      ).length;
      const geoConsistent = marketProfiles.filter((profile) =>
        this.coverage.isVetServiceAreaConsistent(profile),
      ).length;
      const none = this.countStatus(marketProfiles, VerificationStatus.NONE);
      const pending = this.countStatus(marketProfiles, VerificationStatus.PENDING);
      const inReview = this.countStatus(
        marketProfiles,
        VerificationStatus.IN_REVIEW,
      );
      const rejected = this.countStatus(
        marketProfiles,
        VerificationStatus.REJECTED,
      );
      const expired = this.countStatus(
        marketProfiles,
        VerificationStatus.EXPIRED,
      );
      const approved = marketProfiles.filter(
        (profile) =>
          profile.verificationStatus === VerificationStatus.APPROVED &&
          profile.isVerified,
      ).length;
      const approvedActive = marketProfiles.filter(
        (profile) =>
          profile.verificationStatus === VerificationStatus.APPROVED &&
          profile.isVerified &&
          profile.isActive,
      ).length;
      const operationalGeoReady = marketProfiles.filter(
        (profile) =>
          profile.verificationStatus === VerificationStatus.APPROVED &&
          profile.isVerified &&
          profile.isActive &&
          this.coverage.isVetServiceAreaConsistent(profile),
      ).length;
      const coverageGap = Math.max(
        0,
        MIN_VERIFIED_GEO_READY_VETS_PER_MARKET - operationalGeoReady,
      );
      const stage = this.resolveStage({
        totalProfiles: marketProfiles.length,
        serviceAreaComplete,
        geoConsistent,
        pendingReview: pending + inReview,
        approved,
        operationalGeoReady,
      });

      return {
        code: market.code,
        daneCode: market.daneCode,
        city: market.city,
        department: market.department,
        metroGroup: market.metroGroup ?? null,
        totalProfiles: marketProfiles.length,
        serviceAreaComplete,
        geoConsistent,
        verification: {
          none,
          pending,
          inReview,
          approved,
          rejected,
          expired,
        },
        approvedActive,
        operationalGeoReady,
        minimumOperationalVets: MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
        coverageGap,
        supplyReady: coverageGap === 0,
        stage,
        recommendedAction: this.recommendedAction(stage, coverageGap),
        conversion: {
          serviceAreaPct: this.percent(serviceAreaComplete, marketProfiles.length),
          geoConsistencyPct: this.percent(geoConsistent, marketProfiles.length),
          approvalPct: this.percent(approved, marketProfiles.length),
          operationalPct: this.percent(
            operationalGeoReady,
            marketProfiles.length,
          ),
        },
      } as const;
    });

    const totals = markets.reduce(
      (acc, market) => {
        acc.totalProfiles += market.totalProfiles;
        acc.serviceAreaComplete += market.serviceAreaComplete;
        acc.geoConsistent += market.geoConsistent;
        acc.pendingReview +=
          market.verification.pending + market.verification.inReview;
        acc.approved += market.verification.approved;
        acc.operationalGeoReady += market.operationalGeoReady;
        if (market.supplyReady) acc.supplyReadyMarkets += 1;
        return acc;
      },
      {
        totalProfiles: 0,
        serviceAreaComplete: 0,
        geoConsistent: 0,
        pendingReview: 0,
        approved: 0,
        operationalGeoReady: 0,
        supplyReadyMarkets: 0,
      },
    );

    const cartagena = markets.find((market) => market.daneCode === "13001");

    return {
      phase: 17,
      program: "vet-supply-market-readiness",
      country: "CO",
      minimumOperationalVetsPerMarket:
        MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
      commercialLaunchAuthorized: false,
      privacyBoundary:
        "Aggregate operational counts only; no veterinarian PII or exact coordinates are exposed.",
      totals,
      cartagena: cartagena
        ? {
            operationalGeoReady: cartagena.operationalGeoReady,
            coverageGap: cartagena.coverageGap,
            supplyReady: cartagena.supplyReady,
            stage: cartagena.stage,
          }
        : null,
      markets,
      generatedAt: new Date().toISOString(),
    } as const;
  }

  private hasServiceArea(profile: SupplyProfile): boolean {
    return (
      profile.latitude != null &&
      profile.longitude != null &&
      Number.isFinite(profile.latitude) &&
      Number.isFinite(profile.longitude) &&
      Number.isFinite(profile.serviceRadius) &&
      profile.serviceRadius > 0
    );
  }

  private countStatus(
    profiles: SupplyProfile[],
    status: VerificationStatus,
  ): number {
    return profiles.filter((profile) => profile.verificationStatus === status)
      .length;
  }

  private resolveStage(input: {
    totalProfiles: number;
    serviceAreaComplete: number;
    geoConsistent: number;
    pendingReview: number;
    approved: number;
    operationalGeoReady: number;
  }): SupplyStage {
    if (
      input.operationalGeoReady >= MIN_VERIFIED_GEO_READY_VETS_PER_MARKET
    ) {
      return "SUPPLY_READY";
    }
    if (input.totalProfiles === 0) return "ACQUISITION_REQUIRED";
    if (input.serviceAreaComplete < input.totalProfiles || input.geoConsistent === 0) {
      return "SERVICE_AREA_REQUIRED";
    }
    if (input.pendingReview > 0) return "VERIFICATION_IN_PROGRESS";
    if (input.approved === 0) return "VERIFICATION_REQUIRED";
    return "COVERAGE_GAP";
  }

  private recommendedAction(stage: SupplyStage, gap: number): string {
    switch (stage) {
      case "SUPPLY_READY":
        return "Maintain verified supply and monitor availability before market activation.";
      case "ACQUISITION_REQUIRED":
        return `Recruit at least ${gap} veterinarian${gap === 1 ? "" : "s"} for this market.`;
      case "SERVICE_AREA_REQUIRED":
        return "Complete or correct veterinarian city, coordinates and service radius.";
      case "VERIFICATION_IN_PROGRESS":
        return "Prioritize pending professional verification reviews.";
      case "VERIFICATION_REQUIRED":
        return "Move geo-consistent veterinarians into the professional verification workflow.";
      case "COVERAGE_GAP":
      default:
        return `Recruit or activate ${gap} additional verified geo-ready veterinarian${gap === 1 ? "" : "s"}.`;
    }
  }

  private percent(value: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((value / total) * 1000) / 10;
  }
}
