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
    getConfiguredClientCount: jest.fn(),
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

  const originalSupportOwner = process.env.NVET_BETA_SUPPORT_OWNER;
  const originalSupportChannel = process.env.NVET_BETA_SUPPORT_CHANNEL;

  let service: BetaReadinessService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NVET_BETA_SUPPORT_OWNER = "beta-ops";
    process.env.NVET_BETA_SUPPORT_CHANNEL = "configured-route";
    access.isEnabled.mockReturnValue(false);
    access.isBookingEnabled.mockReturnValue(true);
    evidence.getPromotionSummary.mockResolvedValue(verifiedEvidenceSummary());
    authorization.getStatus.mockResolvedValue(missingAuthorization());
    service = new BetaReadinessService(
      prisma,
      access,
      evidence,
      authorization,
    );
  });

  afterAll(() => {
    if (originalSupportOwner === undefined) {
      delete process.env.NVET_BETA_SUPPORT_OWNER;
    } else {
      process.env.NVET_BETA_SUPPORT_OWNER = originalSupportOwner;
    }
    if (originalSupportChannel === undefined) {
      delete process.env.NVET_BETA_SUPPORT_CHANNEL;
    } else {
      process.env.NVET_BETA_SUPPORT_CHANNEL = originalSupportChannel;
    }
  });

  it("reports awaiting-authorization when local and evidence gates pass but no lease exists", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);
    access.getConfiguredClientCount.mockReturnValue(12);

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
    expect(snapshot.activation.externalEvidenceRequired).toBe(true);
    expect(snapshot.activation.commercialLaunchAuthorized).toBe(false);
    expect(snapshot.promotion.verifiedGates).toBe(BETA_EVIDENCE_GATES.length);
  });

  it("reports ready-to-enable after an active authorization lease is issued", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);
    access.getConfiguredClientCount.mockReturnValue(12);
    authorization.getStatus.mockResolvedValue(activeAuthorization());

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("ready-to-enable");
    expect(snapshot.activation.authorizationActive).toBe(true);
    expect(snapshot.authorization.state).toBe("ACTIVE");
  });

  it("keeps activation blocked when local gates pass but evidence is incomplete", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);
    access.getConfiguredClientCount.mockReturnValue(12);
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
    access.getConfiguredClientCount.mockReturnValue(10);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.vetCoverage.satisfied).toBe(false);
    expect(snapshot.localActivationReady).toBe(false);
    expect(snapshot.activation.state).toBe("blocked");
    expect(snapshot.activation.blockingReasons).toContain(
      "CARTAGENA_VET_COVERAGE_INSUFFICIENT",
    );
  });

  it("blocks local activation when the cohort exceeds the launch cap", async () => {
    prisma.vetProfile.count.mockResolvedValue(5);
    access.getConfiguredClientCount.mockReturnValue(51);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.cohort.withinLimit).toBe(false);
    expect(snapshot.localActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons).toContain(
      "CLIENT_COHORT_LIMIT_EXCEEDED",
    );
  });

  it("requires both support owner and channel for machine activation readiness", async () => {
    prisma.vetProfile.count.mockResolvedValue(3);
    access.getConfiguredClientCount.mockReturnValue(10);
    delete process.env.NVET_BETA_SUPPORT_CHANNEL;

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.support.configured).toBe(false);
    expect(snapshot.localActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons).toContain(
      "SUPPORT_CHANNEL_NOT_CONFIGURED",
    );
  });

  it("reports active only when beta is enabled with eligibility and an active authorization", async () => {
    prisma.vetProfile.count.mockResolvedValue(4);
    access.getConfiguredClientCount.mockReturnValue(20);
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
    access.getConfiguredClientCount.mockReturnValue(20);
    access.isEnabled.mockReturnValue(true);
    access.isBookingEnabled.mockReturnValue(false);
    authorization.getStatus.mockResolvedValue(activeAuthorization());

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("paused");
    expect(snapshot.runtime.bookingEnabled).toBe(false);
  });

  it("reports misconfigured if beta is enabled before authorization", async () => {
    prisma.vetProfile.count.mockResolvedValue(4);
    access.getConfiguredClientCount.mockReturnValue(20);
    access.isEnabled.mockReturnValue(true);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("misconfigured");
    expect(snapshot.activation.operatorActivationEligible).toBe(true);
    expect(snapshot.activation.authorizationActive).toBe(false);
  });

  it("reports misconfigured if beta is enabled before all activation gates pass", async () => {
    prisma.vetProfile.count.mockResolvedValue(1);
    access.getConfiguredClientCount.mockReturnValue(0);
    access.isEnabled.mockReturnValue(true);
    authorization.getStatus.mockResolvedValue(activeAuthorization());

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("misconfigured");
    expect(snapshot.activation.machineActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons.length).toBeGreaterThan(0);
  });
});
