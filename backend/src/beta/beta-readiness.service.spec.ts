import { VerificationStatus } from "@prisma/client";
import { BETA_EVIDENCE_GATES } from "./beta-evidence.constants";
import { BetaReadinessService } from "./beta-readiness.service";

describe("BetaReadinessService", () => {
  const prisma = {
    vetProfile: {
      count: jest.fn(),
    },
  } as any;

  const access = {
    getMarket: jest.fn(() => "Cartagena de Indias"),
    isEnabled: jest.fn(() => false),
    isBookingEnabled: jest.fn(() => true),
  } as any;

  const evidence = {
    getPromotionSummary: jest.fn(),
  } as any;

  const authorization = {
    getStatus: jest.fn(),
  } as any;

  const cohort = {
    getOperationalSnapshot: jest.fn(),
  } as any;

  const support = {
    getOperationalSnapshot: jest.fn(),
  } as any;

  const verifiedEvidenceSummary = () => ({
    program: "closed-beta-cartagena",
    ledger: "audit_logs",
    appendOnly: true,
    requiredEnvironment: "production",
    totalGates: BETA_EVIDENCE_GATES.length,
    verifiedGates: BETA_EVIDENCE_GATES.length,
    pendingGates: 0,
    conflictedGates: 0,
    eligibleForOperatorActivation: true,
    commercialLaunchAuthorized: false,
    gates: BETA_EVIDENCE_GATES.map((gate) => ({
      gate,
      status: "VERIFIED",
      requiredEnvironment: "production",
      approvedEvidenceCount: 1,
      stagingApprovedEvidenceCount: 0,
      conflictCount: 0,
      expiredCount: 0,
      latestApprovedEvidenceId: `${gate}-evidence`,
    })),
    generatedAt: new Date().toISOString(),
  });

  const activeAuthorization = () => ({
    state: "ACTIVE",
    authorizationId: "authorization-1",
    authorizedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    conflictReasons: [],
    appendOnly: true,
    historicalAuthorizations: 1,
  });

  const missingAuthorization = () => ({
    state: "MISSING",
    authorizationId: null,
    authorizedAt: null,
    expiresAt: null,
    revokedAt: null,
    conflictReasons: [],
    appendOnly: true,
  });

  const healthyCohort = (count = 12) => ({
    ledger: "audit_logs",
    appendOnly: true,
    activeMemberships: count,
    eligibleActiveMembers: count,
    ineligibleMembers: 0,
    maxInitialClients: 50,
    remainingSlots: Math.max(0, 50 - count),
    withinLimit: count <= 50,
    configured: count > 0,
  });

  const healthySupport = () => ({
    state: "ACTIVE",
    configured: true,
    ownerConfigured: true,
    channelConfigured: true,
    monitoringConfirmed: true,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    criticalIncidentTargetMinutes: 30,
    ledger: "audit_logs",
    appendOnly: true,
    configurationSource: "admin-control-plane",
  });

  let service: BetaReadinessService;

  beforeEach(() => {
    jest.clearAllMocks();
    access.isEnabled.mockReturnValue(false);
    access.isBookingEnabled.mockReturnValue(true);
    evidence.getPromotionSummary.mockResolvedValue(verifiedEvidenceSummary());
    authorization.getStatus.mockResolvedValue(missingAuthorization());
    cohort.getOperationalSnapshot.mockResolvedValue(healthyCohort());
    support.getOperationalSnapshot.mockResolvedValue(healthySupport());
    service = new BetaReadinessService(
      prisma,
      access,
      evidence,
      authorization,
      cohort,
      support,
    );
  });

  it("reports awaiting-authorization when local and evidence gates pass but no lease exists", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);

    const snapshot = await service.getCartagenaSnapshot();

    expect(prisma.vetProfile.count).toHaveBeenCalledWith({
      where: {
        isVerified: true,
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
        city: {
          contains: "cartagena",
          mode: "insensitive",
        },
      },
    });
    expect(snapshot.localActivationReady).toBe(true);
    expect(snapshot.activation.machineActivationReady).toBe(true);
    expect(snapshot.activation.operatorActivationEligible).toBe(true);
    expect(snapshot.activation.authorizationActive).toBe(false);
    expect(snapshot.activation.state).toBe("awaiting-authorization");
    expect(snapshot.activation.blockingReasons).toEqual([]);
    expect(snapshot.cohort.configuredClients).toBe(12);
    expect(snapshot.cohort.ledger).toBe("audit_logs");
    expect(snapshot.cohort.membershipSource).toBe("admin-control-plane");
    expect(snapshot.support.state).toBe("ACTIVE");
    expect(snapshot.support.configurationSource).toBe("admin-control-plane");
    expect(snapshot.privacy.supportContactExposed).toBe(false);
  });

  it("reports ready-to-enable after an active authorization lease is issued", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);
    authorization.getStatus.mockResolvedValue(activeAuthorization());

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("ready-to-enable");
    expect(snapshot.activation.authorizationActive).toBe(true);
    expect(snapshot.authorization.state).toBe("ACTIVE");
  });

  it("keeps activation blocked when local gates pass but evidence is incomplete", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);
    const summary = verifiedEvidenceSummary();
    summary.gates[0] = {
      ...summary.gates[0],
      status: "PENDING",
      approvedEvidenceCount: 0,
      latestApprovedEvidenceId: null,
    } as any;
    evidence.getPromotionSummary.mockResolvedValue({
      ...summary,
      verifiedGates: BETA_EVIDENCE_GATES.length - 1,
      pendingGates: 1,
      eligibleForOperatorActivation: false,
    });

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.localActivationReady).toBe(true);
    expect(snapshot.activation.operatorActivationEligible).toBe(false);
    expect(snapshot.activation.state).toBe("blocked");
    expect(snapshot.promotion.blockingGates).toContain("rcPromoted");
  });

  it("blocks local activation when veterinarian coverage is insufficient", async () => {
    prisma.vetProfile.count.mockResolvedValue(2);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.vetCoverage.satisfied).toBe(false);
    expect(snapshot.localActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons).toContain(
      "CARTAGENA_VET_COVERAGE_INSUFFICIENT",
    );
  });

  it("blocks local activation when the cohort exceeds the launch cap", async () => {
    prisma.vetProfile.count.mockResolvedValue(5);
    cohort.getOperationalSnapshot.mockResolvedValue(healthyCohort(51));

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.cohort.withinLimit).toBe(false);
    expect(snapshot.localActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons).toContain(
      "CLIENT_COHORT_LIMIT_EXCEEDED",
    );
  });

  it("blocks activation if an invited cohort member becomes ineligible", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);
    cohort.getOperationalSnapshot.mockResolvedValue({
      ...healthyCohort(12),
      eligibleActiveMembers: 11,
      ineligibleMembers: 1,
    });

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.localActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons).toContain(
      "COHORT_MEMBER_INELIGIBLE",
    );
  });

  it("requires an active monitored support lease for machine activation readiness", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);
    support.getOperationalSnapshot.mockResolvedValue({
      ...healthySupport(),
      state: "EXPIRED",
      configured: false,
    });

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.support.configured).toBe(false);
    expect(snapshot.support.state).toBe("EXPIRED");
    expect(snapshot.localActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons).toContain(
      "SUPPORT_CONFIGURATION_NOT_ACTIVE",
    );
  });

  it("reports active only when beta is enabled with eligibility and an active authorization", async () => {
    prisma.vetProfile.count.mockResolvedValue(4);
    access.isEnabled.mockReturnValue(true);
    access.isBookingEnabled.mockReturnValue(true);
    authorization.getStatus.mockResolvedValue(activeAuthorization());

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("active");
    expect(snapshot.activation.operatorActivationEligible).toBe(true);
    expect(snapshot.activation.authorizationActive).toBe(true);
    expect(snapshot.activation.commercialLaunchAuthorized).toBe(false);
  });

  it("reports paused when the booking kill switch is active after authorization", async () => {
    prisma.vetProfile.count.mockResolvedValue(4);
    access.isEnabled.mockReturnValue(true);
    access.isBookingEnabled.mockReturnValue(false);
    authorization.getStatus.mockResolvedValue(activeAuthorization());

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("paused");
    expect(snapshot.runtime.bookingEnabled).toBe(false);
  });

  it("reports misconfigured if beta is enabled before authorization", async () => {
    prisma.vetProfile.count.mockResolvedValue(4);
    access.isEnabled.mockReturnValue(true);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("misconfigured");
    expect(snapshot.activation.operatorActivationEligible).toBe(true);
    expect(snapshot.activation.authorizationActive).toBe(false);
  });

  it("reports misconfigured if beta is enabled before all activation gates pass", async () => {
    prisma.vetProfile.count.mockResolvedValue(1);
    cohort.getOperationalSnapshot.mockResolvedValue(healthyCohort(0));
    access.isEnabled.mockReturnValue(true);
    authorization.getStatus.mockResolvedValue(activeAuthorization());

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("misconfigured");
    expect(snapshot.activation.machineActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons.length).toBeGreaterThan(0);
  });
});
