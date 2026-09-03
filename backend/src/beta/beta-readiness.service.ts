import { Injectable } from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BetaEvidenceService } from "./beta-evidence.service";
import { BETA_LEGAL_DOCUMENTS } from "./beta-legal.constants";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

const MAX_INITIAL_CLIENTS = 50;
const MIN_VERIFIED_VETS = 3;
const CRITICAL_INCIDENT_TARGET_MINUTES = 30;

type ActivationState =
  | "blocked"
  | "ready-to-enable"
  | "active"
  | "paused"
  | "misconfigured";

type LocalBlocker =
  | "CLIENT_COHORT_NOT_CONFIGURED"
  | "CLIENT_COHORT_LIMIT_EXCEEDED"
  | "CARTAGENA_VET_COVERAGE_INSUFFICIENT"
  | "SUPPORT_OWNER_NOT_CONFIGURED"
  | "SUPPORT_CHANNEL_NOT_CONFIGURED";

@Injectable()
export class BetaReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClosedBetaAccessService,
    private readonly evidence: BetaEvidenceService,
  ) {}

  async getCartagenaSnapshot() {
    const [verifiedActiveVets, evidencePromotion] = await Promise.all([
      this.prisma.vetProfile.count({
        where: {
          isVerified: true,
          isActive: true,
          verificationStatus: VerificationStatus.APPROVED,
          city: {
            contains: "cartagena",
            mode: "insensitive",
          },
        },
      }),
      this.evidence.getPromotionSummary(),
    ]);

    const configuredClients = this.access.getConfiguredClientCount();
    const cohortConfigured = configuredClients > 0;
    const cohortWithinLimit = configuredClients <= MAX_INITIAL_CLIENTS;
    const vetCoverageSatisfied = verifiedActiveVets >= MIN_VERIFIED_VETS;
    const supportOwnerConfigured = Boolean(
      process.env.NVET_BETA_SUPPORT_OWNER?.trim(),
    );
    const supportChannelConfigured = Boolean(
      process.env.NVET_BETA_SUPPORT_CHANNEL?.trim(),
    );
    const supportConfigured =
      supportOwnerConfigured && supportChannelConfigured;
    const closedBetaEnabled = this.access.isEnabled();
    const bookingEnabled = this.access.isBookingEnabled();

    const blockingReasons: LocalBlocker[] = [];
    if (!cohortConfigured) {
      blockingReasons.push("CLIENT_COHORT_NOT_CONFIGURED");
    }
    if (!cohortWithinLimit) {
      blockingReasons.push("CLIENT_COHORT_LIMIT_EXCEEDED");
    }
    if (!vetCoverageSatisfied) {
      blockingReasons.push("CARTAGENA_VET_COVERAGE_INSUFFICIENT");
    }
    if (!supportOwnerConfigured) {
      blockingReasons.push("SUPPORT_OWNER_NOT_CONFIGURED");
    }
    if (!supportChannelConfigured) {
      blockingReasons.push("SUPPORT_CHANNEL_NOT_CONFIGURED");
    }

    const machineActivationReady = blockingReasons.length === 0;
    const operatorActivationEligible =
      machineActivationReady && evidencePromotion.eligibleForOperatorActivation;
    const activationState = this.resolveActivationState({
      operatorActivationEligible,
      closedBetaEnabled,
      bookingEnabled,
    });

    return {
      phase: 12,
      program: "closed-beta-cartagena",
      market: this.access.getMarket(),
      runtime: {
        closedBetaEnabled,
        bookingEnabled,
      },
      activation: {
        state: activationState,
        machineActivationReady,
        operatorActivationEligible,
        blockingReasons,
        externalEvidenceRequired: true,
        commercialLaunchAuthorized: false,
      },
      promotion: {
        ...evidencePromotion,
        localRuntimeReady: machineActivationReady,
        eligibleForOperatorActivation: operatorActivationEligible,
        blockingGates: evidencePromotion.gates
          .filter((gate) => gate.status !== "VERIFIED")
          .map((gate) => gate.gate),
      },
      cohort: {
        configured: cohortConfigured,
        configuredClients,
        maxInitialClients: MAX_INITIAL_CLIENTS,
        withinLimit: cohortWithinLimit,
      },
      vetCoverage: {
        verifiedActiveVets,
        minimumRequired: MIN_VERIFIED_VETS,
        satisfied: vetCoverageSatisfied,
      },
      legal: {
        termsVersion: BETA_LEGAL_DOCUMENTS.terms.version,
        privacyVersion: BETA_LEGAL_DOCUMENTS.privacy.version,
        effectiveAt: BETA_LEGAL_DOCUMENTS.effectiveAt,
        explicitAcceptanceEnforcedForBooking: true,
      },
      support: {
        ownerConfigured: supportOwnerConfigured,
        channelConfigured: supportChannelConfigured,
        configured: supportConfigured,
        criticalIncidentTargetMinutes: CRITICAL_INCIDENT_TARGET_MINUTES,
      },
      localActivationReady: machineActivationReady,
      promotionBoundary: {
        machineReadinessIsNotLaunchApproval: true,
        evidenceApprovalIsNotCommercialLaunchApproval: true,
        evidenceLedger: "audit_logs",
        requiredEvidenceManifest:
          "docs/production/BETA_CARTAGENA_READINESS.json",
      },
      privacy: {
        rawClientIdentifiersExposed: false,
        cohortHashesExposed: false,
        supportContactExposed: false,
        evidenceReferencesAdminOnly: true,
      },
      generatedAt: new Date().toISOString(),
    } as const;
  }

  private resolveActivationState(input: {
    operatorActivationEligible: boolean;
    closedBetaEnabled: boolean;
    bookingEnabled: boolean;
  }): ActivationState {
    if (input.closedBetaEnabled && !input.operatorActivationEligible) {
      return "misconfigured";
    }
    if (input.closedBetaEnabled && !input.bookingEnabled) {
      return "paused";
    }
    if (input.closedBetaEnabled) {
      return "active";
    }
    if (input.operatorActivationEligible) {
      return "ready-to-enable";
    }
    return "blocked";
  }
}
