import { BETA_EVIDENCE_GATES } from "./beta-evidence.constants";
import { CartagenaLaunchReadinessService } from "./cartagena-launch-readiness.service";

describe("CartagenaLaunchReadinessService", () => {
  const betaReadiness = { getCartagenaSnapshot: jest.fn() } as any;
  const betaActivation = { getPrerequisites: jest.fn() } as any;
  const marketLaunchPolicy = { getPolicySnapshot: jest.fn() } as any;
  const vetActivationTelemetry = { getSnapshot: jest.fn() } as any;
  let service: CartagenaLaunchReadinessService;

  const evidenceGates = BETA_EVIDENCE_GATES.map((gate) => ({
    gate,
    status: "VERIFIED" as const,
    requiredEnvironment: "production" as const,
    approvedEvidenceCount: 1,
    stagingApprovedEvidenceCount: 0,
    conflictCount: 0,
    expiredCount: 0,
    latestApprovedEvidenceId: `${gate}-evidence`,
  }));

  const betaSnapshot = {
    runtime: {
      closedBetaEnabled: false,
      bookingEnabled: true,
    },
    activation: {
      state: "ready-to-enable",
      machineActivationReady: true,
      operatorActivationEligible: true,
      authorizationActive: true,
      authorizationExpiresAt: "2026-09-17T12:00:00.000Z",
      blockingReasons: [],
    },
    promotion: {
      totalGates: BETA_EVIDENCE_GATES.length,
      verifiedGates: BETA_EVIDENCE_GATES.length,
      pendingGates: 0,
      conflictedGates: 0,
      eligibleForOperatorActivation: true,
      gates: evidenceGates,
    },
    vetCoverage: {
      verifiedActiveVets: 3,
      minimumRequired: 3,
      coverageGap: 0,
      satisfied: true,
      source: "GET /api/coverage/cartagena-activation",
    },
  };

  const activationPrerequisites = {
    eligible: true,
    blockers: [],
    evidenceEligible: true,
    verifiedActiveVets: 3,
    minimumVerifiedVets: 3,
    vetCoverageGap: 0,
    vetCoverageSource: "cartagena-vet-supply-activation-phase-18",
    vetCoverageFormalEvidenceEligible: true,
    configuredClients: 10,
    eligibleCohortMembers: 10,
    ineligibleCohortMembers: 0,
    maxInitialClients: 50,
    supportConfigured: true,
    supportState: "ACTIVE",
    supportExpiresAt: "2026-09-17T12:00:00.000Z",
    marketConfigured: true,
  };

  const marketSnapshot = {
    guardEnabled: true,
    markets: [
      {
        code: "CTG",
        daneCode: "13001",
        city: "Cartagena de Indias",
        department: "Bolívar",
        providerRequested: true,
        expansionAllowed: true,
        geoReadyVets: 3,
        minimumRequired: 3,
        coverageSatisfied: true,
        bookingGateEligible: true,
        state: "BOOKING_GATE_ELIGIBLE",
      },
    ],
  };

  const telemetrySnapshot = {
    measurementMode: "read-only-observability",
    totals: {
      leads: 8,
      operationalReady: 3,
      onTrack: 2,
      atRisk: 1,
      breached: 0,
      critical: 0,
      paused: 2,
      medianLeadToOperationalEvidenceHours: 36,
    },
    bottlenecks: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CartagenaLaunchReadinessService(
      betaReadiness,
      betaActivation,
      marketLaunchPolicy,
      vetActivationTelemetry,
    );
    betaReadiness.getCartagenaSnapshot.mockResolvedValue(betaSnapshot);
    betaActivation.getPrerequisites.mockResolvedValue(activationPrerequisites);
    marketLaunchPolicy.getPolicySnapshot.mockResolvedValue(marketSnapshot);
    vetActivationTelemetry.getSnapshot.mockResolvedValue(telemetrySnapshot);
  });

  it("returns GO when every hard launch prerequisite is satisfied", async () => {
    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.state).toBe("GO");
    expect(snapshot.decision.prerequisitesSatisfied).toBe(true);
    expect(snapshot.decision.recommendedAction).toBe(
      "ENABLE_CARTAGENA_CLOSED_BETA_WHEN_OPERATOR_READY",
    );
    expect(snapshot.decision.blockers).toEqual([]);
    expect(snapshot.progress.evidenceCompletionPercentage).toBe(100);
    expect(snapshot.progress.operationalSupplyPercentage).toBe(100);
    expect(vetActivationTelemetry.getSnapshot).toHaveBeenCalledWith("13001");
    expect(betaActivation.getPrerequisites).toHaveBeenCalledTimes(1);
  });

  it("returns HOLD when a required production evidence gate is pending", async () => {
    betaReadiness.getCartagenaSnapshot.mockResolvedValue({
      ...betaSnapshot,
      promotion: {
        ...betaSnapshot.promotion,
        verifiedGates: BETA_EVIDENCE_GATES.length - 1,
        pendingGates: 1,
        eligibleForOperatorActivation: false,
        gates: evidenceGates.map((gate) =>
          gate.gate === "paymentRailVerified"
            ? { ...gate, status: "PENDING" as const, approvedEvidenceCount: 0 }
            : gate,
        ),
      },
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.state).toBe("HOLD");
    expect(snapshot.decision.blockers).toContain(
      "EVIDENCE_paymentRailVerified_PENDING",
    );
    expect(snapshot.decision.recommendedAction).toBe(
      "KEEP_BETA_DISABLED_AND_CLEAR_BLOCKERS",
    );
  });

  it("returns HOLD when the Cartagena provider market gate is not eligible", async () => {
    marketLaunchPolicy.getPolicySnapshot.mockResolvedValue({
      ...marketSnapshot,
      markets: [
        {
          ...marketSnapshot.markets[0],
          providerRequested: false,
          bookingGateEligible: false,
          state: "PRELAUNCH",
        },
      ],
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.state).toBe("HOLD");
    expect(snapshot.decision.blockers).toEqual(
      expect.arrayContaining([
        "CARTAGENA_PROVIDER_NOT_ACTIVE",
        "CARTAGENA_BOOKING_GATE_NOT_ELIGIBLE",
      ]),
    );
  });

  it("returns HOLD when the closed-beta market drifts away from Cartagena", async () => {
    betaActivation.getPrerequisites.mockResolvedValue({
      ...activationPrerequisites,
      eligible: false,
      blockers: ["BETA_MARKET_MISMATCH"],
      marketConfigured: false,
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.state).toBe("HOLD");
    expect(snapshot.decision.blockers).toContain(
      "ACTIVATION_PREREQUISITE_BETA_MARKET_MISMATCH",
    );
    expect(snapshot.runtime.activationPrerequisitesEligible).toBe(false);
    expect(snapshot.runtime.betaMarketConfiguredForCartagena).toBe(false);
  });

  it("returns PAUSE when the booking kill switch is active during beta", async () => {
    betaReadiness.getCartagenaSnapshot.mockResolvedValue({
      ...betaSnapshot,
      runtime: {
        closedBetaEnabled: true,
        bookingEnabled: false,
      },
      activation: {
        ...betaSnapshot.activation,
        state: "paused",
      },
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.state).toBe("PAUSE");
    expect(snapshot.decision.pausedByKillSwitch).toBe(true);
    expect(snapshot.decision.recommendedAction).toBe(
      "KEEP_BOOKING_PAUSED_AND_REVIEW_INCIDENT",
    );
  });

  it("keeps recruitment SLA deterioration as a warning, never a substitute supply gate", async () => {
    vetActivationTelemetry.getSnapshot.mockResolvedValue({
      ...telemetrySnapshot,
      totals: {
        ...telemetrySnapshot.totals,
        breached: 2,
        critical: 1,
      },
      bottlenecks: [
        {
          blocker: "DOCUMENT_REVIEW_REQUIRED",
          count: 3,
          breachedOrCritical: 3,
          oldestHours: 96,
        },
      ],
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.state).toBe("GO");
    expect(snapshot.decision.warnings).toEqual(
      expect.arrayContaining([
        "VET_ACTIVATION_PIPELINE_HAS_CRITICAL_LEADS",
        "VET_ACTIVATION_PIPELINE_HAS_BREACHED_SLAS",
      ]),
    );
    expect(snapshot.recruitmentResilience.blockingForLaunchDecision).toBe(false);
    expect(snapshot.supply.strictSupplySatisfied).toBe(true);
    expect(snapshot.boundaries.noCommercialLaunchAuthorization).toBe(true);
  });
});
