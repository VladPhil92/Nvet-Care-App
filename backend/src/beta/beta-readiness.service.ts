import { Injectable } from "@nestjs/common";
import { CartagenaVetActivationService } from "../coverage/cartagena-vet-activation.service";
import { BetaActivationService } from "./beta-activation.service";
import { BetaCohortService } from "./beta-cohort.service";
import { BetaEvidenceService } from "./beta-evidence.service";
import { BETA_LEGAL_DOCUMENTS } from "./beta-legal.constants";
import { BetaSupportService } from "./beta-support.service";
import { ClosedBetaAccessService } from "./closed-beta-access.service";

const MAX_INITIAL_CLIENTS = 50;

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
  | "SUPPORT_CONFIGURATION_NOT_ACTIVE";

@Injectable()
export class BetaReadinessService {
  constructor(
    private readonly access: ClosedBetaAccessService,
    private readonly evidence: BetaEvidenceService,
    private readonly authorization: BetaActivationService,
    private readonly cohort: BetaCohortService,
    private readonly support: BetaSupportService,
    private readonly cartagenaSupply: CartagenaVetActivationService,
  ) {}

  async getCartagenaSnapshot() {
    const [supply, evidencePromotion, authorization, cohort, support] =
      await Promise.all([
        this.cartagenaSupply.getSnapshot(),
        this.evidence.getPromotionSummary(),
        this.authorization.getStatus(),
        this.cohort.getOperationalSnapshot(),
        this.support.getOperationalSnapshot(),
      ]);

    const configuredClients = cohort.activeMemberships;
    const cohortConfigured = cohort.configured;
    const cohortWithinLimit = cohort.withinLimit;
    const cohortMembersEligible = cohort.ineligibleMembers === 0;
    const verifiedActiveVets = supply.operationalReady;
    const vetCoverageSatisfied = supply.supplyActivationReady;
    const supportConfigured = support.configured;
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
    if (!supportConfigured) {
      blockingReasons.push("SUPPORT_CONFIGURATION_NOT_ACTIVE");
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
      phase: 19,
      program: "closed-beta-cartagena",
      readinessConvergence: "cartagena-vet-supply-activation-phase-18",
      market: this.access.getMarket(),
      geographicCoverageProgram: "colombia-service-coverage-phase-14",
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
        minimumRequired: supply.minimumOperationalVets,
        coverageGap: supply.coverageGap,
        satisfied: vetCoverageSatisfied,
        source: "GET /api/coverage/cartagena-activation",
        sourcePhase: supply.phase,
        sourceProgram: supply.program,
        formalEvidenceGate: supply.formalEvidence.gateId,
        formalEvidenceEligible: supply.formalEvidence.eligible,
        geoLocationRequired: true,
        geoConsistencyRequired: true,
        serviceRadiusRequired: true,
        approvedDocumentsRequired: true,
        professionalRegistryVerificationRequired: true,
        activeProfileRequired: true,
        nationalCoverageReadinessEndpoint: "GET /api/coverage/readiness",
      },
      legal: {
        termsVersion: BETA_LEGAL_DOCUMENTS.terms.version,
        privacyVersion: BETA_LEGAL_DOCUMENTS.privacy.version,
        effectiveAt: BETA_LEGAL_DOCUMENTS.effectiveAt,
        explicitAcceptanceEnforcedForBooking: true,
      },
      support: {
        state: support.state,
        ownerConfigured: support.ownerConfigured,
        channelConfigured: support.channelConfigured,
        monitoringConfirmed: support.monitoringConfirmed,
        configured: supportConfigured,
        expiresAt: support.expiresAt,
        criticalIncidentTargetMinutes: support.criticalIncidentTargetMinutes,
        ledger: "audit_logs",
        appendOnly: true,
        configurationSource: "admin-control-plane",
      },
      localActivationReady: machineActivationReady,
      promotionBoundary: {
        machineReadinessIsNotLaunchApproval: true,
        evidenceApprovalIsNotCommercialLaunchApproval: true,
        operatorAuthorizationDoesNotToggleProviderConfiguration: true,
        authorizationRequiredForBooking: true,
        strictVetSupplySnapshotRequired: true,
        evidenceLedger: "audit_logs",
        authorizationLedger: "audit_logs",
        cohortLedger: "audit_logs",
        supportLedger: "audit_logs",
        requiredEvidenceManifest:
          "docs/production/BETA_CARTAGENA_READINESS.json",
      },
      privacy: {
        rawClientIdentifiersExposed: false,
        cohortHashesExposed: false,
        environmentCohortHashesCanonical: false,
        supportContactExposed: false,
        supportConfigurationAdminOnly: true,
        evidenceReferencesAdminOnly: true,
        cohortMemberDetailsAdminOnly: true,
        vetCoordinatesExposed: false,
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
