import { Injectable } from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BetaActivationService } from "./beta-activation.service";
import { BetaCohortService } from "./beta-cohort.service";
import { BetaEvidenceService } from "./beta-evidence.service";
import { BETA_LEGAL_DOCUMENTS } from "./beta-legal.constants";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

const MAX_INITIAL_CLIENTS = 50;
const MIN_VERIFIED_VETS = 3;
const CRITICAL_INCIDENT_TARGET_MINUTES = 30;

type ActivationState =
  | "blocked"
  | "awaiting-authorization"
  | "ready-to-enable"
  | "active"
  | "paused"
  | "misconfigured";

type LocalBlocker =
  | "CLIENT_COHORT_NOT_CONFIGURED"
  | "CLIENT_COHORT_LIMIT_EXCEEDED"
  | "COHORT_MEMBER_INELIGIBLE"
  | "CARTAGENA_VET_COVERAGE_INSUFFICIENT"
  | "SUPPORT_OWNER_NOT_CONFIGURED"
  | "SUPPORT_CHANNEL_NOT_CONFIGURED";

@Injectable()
export class BetaReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClosedBetaAccessService,
    private readonly evidence: BetaEvidenceService,
    private readonly authorization: BetaActivationService,
    private readonly cohort: BetaCohortService,
  ) {}

  async getCartagenaSnapshot() {
    const [verifiedActiveVets, evidencePromotion, authorization, cohort] =
      await Promise.all([
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
        this.authorization.getStatus(),
        this.cohort.getOperationalSnapshot(),
      ]);

    const configuredClients = cohort.activeMemberships;
    const cohortConfigured = cohort.configured;
    const cohortWithinLimit = cohort.withinLimit;
    const cohortMembersEligible = cohort.ineligibleMembers === 0;
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
    if (!cohortMembersEligible) {
      blockingReasons.push("COHORT_MEMBER_INELIGIBLE");
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
    const authorizationActive = authorization.state === "ACTIVE";
    const activationState = this.resolveActivationState({
      operatorActivationEligible,
      authorizationActive,
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
        authorizationRequired: true,
        authorizationActive,
        authorizationState: authorization.state,
        authorizationExpiresAt: authorization.expiresAt,
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
      authorization,
      cohort: {
        configured: cohortConfigured,
        configuredClients,
        eligibleActiveMembers: cohort.eligibleActiveMembers,
        ineligibleMembers: cohort.ineligibleMembers,
        maxInitialClients: MAX_INITIAL_CLIENTS,
        remainingSlots: cohort.remainingSlots,
        withinLimit: cohortWithinLimit,
        ledger: "audit_logs",
        appendOnly: true,
        membershipSource: "admin-control-plane",
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
        operatorAuthorizationDoesNotToggleProviderConfiguration: true,
        authorizationRequiredForBooking: true,
        evidenceLedger: "audit_logs",
        authorizationLedger: "audit_logs",
        cohortLedger: "audit_logs",
        requiredEvidenceManifest:
          "docs/production/BETA_CARTAGENA_READINESS.json",
      },
      privacy: {
        rawClientIdentifiersExposed: false,
        cohortHashesExposed: false,
        environmentCohortHashesCanonical: false,
        supportContactExposed: false,
        evidenceReferencesAdminOnly: true,
        cohortMemberDetailsAdminOnly: true,
      },
      generatedAt: new Date().toISOString(),
    } as const;
  }

  private resolveActivationState(input: {
    operatorActivationEligible: boolean;
    authorizationActive: boolean;
    closedBetaEnabled: boolean;
    bookingEnabled: boolean;
  }): ActivationState {
    if (
      input.closedBetaEnabled &&
      (!input.operatorActivationEligible || !input.authorizationActive)
    ) {
      return "misconfigured";
    }
    if (input.closedBetaEnabled && !input.bookingEnabled) {
      return "paused";
    }
    if (input.closedBetaEnabled) {
      return "active";
    }
    if (input.operatorActivationEligible && input.authorizationActive) {
      return "ready-to-enable";
    }
    if (input.operatorActivationEligible) {
      return "awaiting-authorization";
    }
    return "blocked";
  }
}
