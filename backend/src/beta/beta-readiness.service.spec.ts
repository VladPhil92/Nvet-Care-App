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

  let service: BetaReadinessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BetaReadinessService(prisma, access);
  });

  it("reports local activation readiness without exposing cohort identifiers", async () => {
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
    expect(snapshot.cohort.configuredClients).toBe(12);
    expect(snapshot.vetCoverage.verifiedActiveVets).toBe(3);
    expect(snapshot.privacy.cohortHashesExposed).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("NVET_CLOSED_BETA_CLIENT_HASHES");
  });

  it("keeps local activation blocked if veterinarian coverage is insufficient", async () => {
    prisma.vetProfile.count.mockResolvedValue(2);
    access.getConfiguredClientCount.mockReturnValue(10);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.vetCoverage.satisfied).toBe(false);
    expect(snapshot.localActivationReady).toBe(false);
  });

  it("keeps local activation blocked if the cohort exceeds the launch cap", async () => {
    prisma.vetProfile.count.mockResolvedValue(5);
    access.getConfiguredClientCount.mockReturnValue(51);

    const snapshot = await service.getCartagenaSnapshot();

    expect(snapshot.cohort.withinLimit).toBe(false);
    expect(snapshot.localActivationReady).toBe(false);
  });
});
