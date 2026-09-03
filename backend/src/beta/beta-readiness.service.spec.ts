import { VerificationStatus } from "@prisma/client";
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

  const originalSupportOwner = process.env.NVET_BETA_SUPPORT_OWNER;
  const originalSupportChannel = process.env.NVET_BETA_SUPPORT_CHANNEL;

  let service: BetaReadinessService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NVET_BETA_SUPPORT_OWNER = "beta-ops";
    process.env.NVET_BETA_SUPPORT_CHANNEL = "configured-route";
    access.isEnabled.mockReturnValue(false);
    access.isBookingEnabled.mockReturnValue(true);
    service = new BetaReadinessService(prisma, access);
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

  it("reports ready-to-enable when all local machine gates pass without exposing identifiers", async () => {
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
    expect(snapshot.activation.state).toBe("ready-to-enable");
    expect(snapshot.activation.blockingReasons).toEqual([]);
    expect(snapshot.activation.externalEvidenceRequired).toBe(true);
    expect(snapshot.activation.commercialLaunchAuthorized).toBe(false);
    expect(snapshot.cohort.configuredClients).toBe(12);
    expect(snapshot.vetCoverage.verifiedActiveVets).toBe(3);
    expect(snapshot.privacy.cohortHashesExposed).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain(
      "NVET_CLOSED_BETA_CLIENT_HASHES",
    );
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

  it("reports active only when closed beta and booking are enabled with all machine gates satisfied", async () => {
    prisma.vetProfile.count.mockResolvedValue(4);
    access.getConfiguredClientCount.mockReturnValue(20);
    access.isEnabled.mockReturnValue(true);
    access.isBookingEnabled.mockReturnValue(true);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("active");
    expect(snapshot.activation.machineActivationReady).toBe(true);
    expect(snapshot.activation.commercialLaunchAuthorized).toBe(false);
  });

  it("reports paused when the booking kill switch is active", async () => {
    prisma.vetProfile.count.mockResolvedValue(4);
    access.getConfiguredClientCount.mockReturnValue(20);
    access.isEnabled.mockReturnValue(true);
    access.isBookingEnabled.mockReturnValue(false);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("paused");
    expect(snapshot.runtime.bookingEnabled).toBe(false);
  });

  it("reports misconfigured if beta is enabled before local machine gates pass", async () => {
    prisma.vetProfile.count.mockResolvedValue(1);
    access.getConfiguredClientCount.mockReturnValue(0);
    access.isEnabled.mockReturnValue(true);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.activation.state).toBe("misconfigured");
    expect(snapshot.activation.machineActivationReady).toBe(false);
    expect(snapshot.activation.blockingReasons.length).toBeGreaterThan(0);
  });
});
