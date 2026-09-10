import { Injectable } from "@nestjs/common";
import { MarketLaunchPolicyService } from "../coverage/market-launch-policy.service";
import { VetActivationTelemetryService } from "../recruitment/vet-activation-telemetry.service";
import {
  BETA_EVIDENCE_GATES,
  BetaEvidenceGate,
} from "./beta-evidence.constants";
import { BetaReadinessService } from "./beta-readiness.service";

const PROGRAM = "cartagena-launch-readiness-phase-24";
const CARTAGENA_DANE_CODE = "13001";

type LaunchDecision = "GO" | "HOLD" | "PAUSE";
type LaunchGateCategory =
  | "RELEASE"
  | "INFRASTRUCTURE"
  | "FINANCIAL"
  | "SUPPLY"
  | "OPERATIONS"
  | "LEGAL";

const GATE_CATEGORY: Record<BetaEvidenceGate, LaunchGateCategory> = {
  rcPromoted: "RELEASE",
  productionBackupConfigured: "INFRASTRUCTURE",
  restoreDrillVerified: "INFRASTRUCTURE",
  productionAlertingVerified: "INFRASTRUCTURE",
  paymentRailVerified: "FINANCIAL",
  cartagenaVetCoverageVerified: "SUPPLY",
  clientCohortConfigured: "OPERATIONS",
  supportOwnerConfirmed: "OPERATIONS",
  privacyAndTermsReviewed: "LEGAL",
  rollbackDrillVerified: "OPERATIONS",
};

const CATEGORY_ORDER: LaunchGateCategory[] = [
  "RELEASE",
  "INFRASTRUCTURE",
  "FINANCIAL",
  "SUPPLY",
  "OPERATIONS",
  "LEGAL",
];

@Injectable()
export class CartagenaLaunchReadinessService {
  constructor(
    private readonly betaReadiness: BetaReadinessService,
    private readonly marketLaunchPolicy: MarketLaunchPolicyService,
    private readonly vetActivationTelemetry: VetActivationTelemetryService,
  ) {}

  async getSnapshot() {
    const [beta, marketPolicy, vetActivation] = await Promise.all([
      this.betaReadiness.getCartagenaSnapshot(),
      this.marketLaunchPolicy.getPolicySnapshot(),
      this.vetActivationTelemetry.getSnapshot(CARTAGENA_DANE_CODE),
    ]);

    const cartagenaPolicy = marketPolicy.markets.find(
      (market) => market.daneCode === CARTAGENA_DANE_CODE,
    );
    const evidenceGates = beta.promotion.gates.map((gate) => ({
      ...gate,
      category: GATE_CATEGORY[gate.gate],
      blocking: true,
    }));

    const blockers: string[] = [];
    if (!marketPolicy.guardEnabled) blockers.push("MARKET_GUARD_DISABLED");
    if (!cartagenaPolicy) {
      blockers.push("CARTAGENA_MARKET_POLICY_MISSING");
    } else {
      if (!cartagenaPolicy.providerRequested) {
        blockers.push("CARTAGENA_PROVIDER_NOT_ACTIVE");
      }
      if (!cartagenaPolicy.coverageSatisfied) {
        blockers.push("CARTAGENA_MARKET_COVERAGE_INSUFFICIENT");
      }
      if (!cartagenaPolicy.bookingGateEligible) {
        blockers.push("CARTAGENA_BOOKING_GATE_NOT_ELIGIBLE");
      }
    }

    for (const reason of beta.activation.blockingReasons) {
      blockers.push(`BETA_${reason}`);
    }
    for (const gate of evidenceGates) {
      if (gate.status !== "VERIFIED") {
        blockers.push(`EVIDENCE_${gate.gate}_${gate.status}`);
      }
    }
    if (!beta.activation.authorizationActive) {
      blockers.push("BETA_ACTIVATION_AUTHORIZATION_INACTIVE");
    }

    const uniqueBlockers = [...new Set(blockers)];
    const pausedByKillSwitch =
      beta.runtime.closedBetaEnabled && !beta.runtime.bookingEnabled;
    const prerequisitesSatisfied = uniqueBlockers.length === 0;
    const decision: LaunchDecision = pausedByKillSwitch
      ? "PAUSE"
      : prerequisitesSatisfied
        ? "GO"
        : "HOLD";

    const warnings: string[] = [];
    if (vetActivation.totals.critical > 0) {
      warnings.push("VET_ACTIVATION_PIPELINE_HAS_CRITICAL_LEADS");
    }
    if (vetActivation.totals.breached > 0) {
      warnings.push("VET_ACTIVATION_PIPELINE_HAS_BREACHED_SLAS");
    }
    if (vetActivation.totals.atRisk > 0) {
      warnings.push("VET_ACTIVATION_PIPELINE_HAS_AT_RISK_LEADS");
    }

    const categories = CATEGORY_ORDER.map((category) => {
      const gates = evidenceGates.filter((gate) => gate.category === category);
      const verified = gates.filter(
        (gate) => gate.status === "VERIFIED",
      ).length;
      const conflicted = gates.filter(
        (gate) => gate.status === "CONFLICTED",
      ).length;
      return {
        category,
        total: gates.length,
        verified,
        pending: gates.length - verified - conflicted,
        conflicted,
        ready:
          gates.length > 0 && verified === gates.length && conflicted === 0,
        gates,
      } as const;
    });

    const operationalSupplyProgress = beta.vetCoverage.minimumRequired
      ? Math.min(
          100,
          Math.round(
            (beta.vetCoverage.verifiedActiveVets /
              beta.vetCoverage.minimumRequired) *
              100,
          ),
        )
      : 0;
    const evidenceCompletion = beta.promotion.totalGates
      ? Math.round(
          (beta.promotion.verifiedGates / beta.promotion.totalGates) * 100,
        )
      : 0;

    return {
      phase: 24,
      program: PROGRAM,
      market: {
        code: "CTG",
        daneCode: CARTAGENA_DANE_CODE,
        city: "Cartagena de Indias",
        department: "Bolívar",
      },
      decision: {
        state: decision,
        scope: "CLOSED_BETA_CARTAGENA",
        prerequisitesSatisfied,
        pausedByKillSwitch,
        recommendedAction: this.resolveRecommendedAction({
          decision,
          closedBetaEnabled: beta.runtime.closedBetaEnabled,
        }),
        blockers: uniqueBlockers,
        warnings,
        commercialLaunchAuthorized: false,
        decisionAuthorizesCommercialLaunch: false,
      },
      progress: {
        evidenceCompletionPercentage: evidenceCompletion,
        operationalSupplyPercentage: operationalSupplyProgress,
        verifiedEvidenceGates: beta.promotion.verifiedGates,
        totalEvidenceGates: beta.promotion.totalGates,
      },
      runtime: {
        closedBetaEnabled: beta.runtime.closedBetaEnabled,
        bookingEnabled: beta.runtime.bookingEnabled,
        betaActivationState: beta.activation.state,
        authorizationActive: beta.activation.authorizationActive,
        authorizationExpiresAt: beta.activation.authorizationExpiresAt,
        marketGuardEnabled: marketPolicy.guardEnabled,
        cartagenaBookingGateEligible:
          cartagenaPolicy?.bookingGateEligible ?? false,
        cartagenaProviderRequested: cartagenaPolicy?.providerRequested ?? false,
      },
      categories,
      supply: {
        operationalReadyVets: beta.vetCoverage.verifiedActiveVets,
        minimumRequiredVets: beta.vetCoverage.minimumRequired,
        coverageGap: beta.vetCoverage.coverageGap,
        strictSupplySatisfied: beta.vetCoverage.satisfied,
        source: beta.vetCoverage.source,
      },
      recruitmentResilience: {
        measurementMode: vetActivation.measurementMode,
        leads: vetActivation.totals.leads,
        operationalReadyFromRecruitment: vetActivation.totals.operationalReady,
        onTrack: vetActivation.totals.onTrack,
        atRisk: vetActivation.totals.atRisk,
        breached: vetActivation.totals.breached,
        critical: vetActivation.totals.critical,
        paused: vetActivation.totals.paused,
        medianLeadToOperationalEvidenceHours:
          vetActivation.totals.medianLeadToOperationalEvidenceHours,
        bottlenecks: vetActivation.bottlenecks.slice(0, 5),
        blockingForLaunchDecision: false,
        note: "Recruitment SLA health is an operational resilience signal. Strict verified VET supply remains the launch gate source of truth.",
      },
      boundaries: {
        sourceEvidenceGates: BETA_EVIDENCE_GATES,
        strictSupplySource: beta.vetCoverage.source,
        activationTelemetrySource:
          "GET /api/recruitment/vets/activation-telemetry?marketDaneCode=13001",
        providerPolicySource: "GET /api/coverage/launch-policy",
        betaReadinessSource: "GET /api/beta/readiness",
        noAutomaticEvidenceApproval: true,
        noProviderConfigurationMutation: true,
        noCommercialLaunchAuthorization: true,
      },
      generatedAt: new Date().toISOString(),
    } as const;
  }

  private resolveRecommendedAction(input: {
    decision: LaunchDecision;
    closedBetaEnabled: boolean;
  }) {
    if (input.decision === "PAUSE") {
      return "KEEP_BOOKING_PAUSED_AND_REVIEW_INCIDENT" as const;
    }
    if (input.decision === "GO" && input.closedBetaEnabled) {
      return "CONTINUE_CONTROLLED_CARTAGENA_BETA" as const;
    }
    if (input.decision === "GO") {
      return "ENABLE_CARTAGENA_CLOSED_BETA_WHEN_OPERATOR_READY" as const;
    }
    if (input.closedBetaEnabled) {
      return "DISABLE_OR_REMEDIATE_BETA_BEFORE_CONTINUING" as const;
    }
    return "KEEP_BETA_DISABLED_AND_CLEAR_BLOCKERS" as const;
  }
}
