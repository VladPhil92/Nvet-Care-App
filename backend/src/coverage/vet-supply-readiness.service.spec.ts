import { VerificationStatus } from "@prisma/client";
import { CoverageService } from "./coverage.service";
import { VetSupplyReadinessService } from "./vet-supply-readiness.service";

describe("VetSupplyReadinessService", () => {
  const coverage = new CoverageService();

  function createService(profiles: Array<Record<string, unknown>>) {
    const prisma = {
      vetProfile: {
        findMany: jest.fn().mockResolvedValue(profiles),
      },
    };
    return new VetSupplyReadinessService(prisma as never, coverage);
  }

  it("builds a privacy-safe market funnel and exact Cartagena coverage gap", async () => {
    const service = createService([
      {
        city: "Cartagena de Indias",
        department: "Bolívar",
        latitude: 10.391,
        longitude: -75.479,
        serviceRadius: 10,
        isVerified: true,
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
      },
      {
        city: "Cartagena",
        department: "Bolívar",
        latitude: 10.405,
        longitude: -75.5,
        serviceRadius: 12,
        isVerified: false,
        isActive: true,
        verificationStatus: VerificationStatus.IN_REVIEW,
      },
      {
        city: "Bogotá D.C.",
        department: "Bogotá D.C.",
        latitude: 4.711,
        longitude: -74.0721,
        serviceRadius: 15,
        isVerified: false,
        isActive: true,
        verificationStatus: VerificationStatus.PENDING,
      },
    ]);

    const snapshot = await service.getSupplyFunnelSnapshot();
    const cartagena = snapshot.markets.find(
      (market) => market.daneCode === "13001",
    );
    const bogota = snapshot.markets.find(
      (market) => market.daneCode === "11001",
    );

    expect(snapshot.phase).toBe(17);
    expect(snapshot.commercialLaunchAuthorized).toBe(false);
    expect(snapshot.totals.totalProfiles).toBe(3);
    expect(cartagena).toMatchObject({
      totalProfiles: 2,
      serviceAreaComplete: 2,
      geoConsistent: 2,
      operationalGeoReady: 1,
      coverageGap: 2,
      supplyReady: false,
      stage: "VERIFICATION_IN_PROGRESS",
    });
    expect(cartagena?.verification.inReview).toBe(1);
    expect(bogota?.verification.pending).toBe(1);
    expect(bogota?.stage).toBe("VERIFICATION_IN_PROGRESS");
    expect(JSON.stringify(snapshot)).not.toContain("licenseNumber");
    expect(JSON.stringify(snapshot)).not.toContain("email");
  });

  it("marks a market supply-ready only with three approved active geo-consistent vets", async () => {
    const readyVet = (latitude: number, longitude: number) => ({
      city: "Cartagena de Indias",
      department: "Bolívar",
      latitude,
      longitude,
      serviceRadius: 20,
      isVerified: true,
      isActive: true,
      verificationStatus: VerificationStatus.APPROVED,
    });

    const service = createService([
      readyVet(10.39, -75.48),
      readyVet(10.4, -75.49),
      readyVet(10.38, -75.47),
    ]);

    const snapshot = await service.getSupplyFunnelSnapshot();
    const cartagena = snapshot.markets.find(
      (market) => market.daneCode === "13001",
    );

    expect(cartagena).toMatchObject({
      operationalGeoReady: 3,
      coverageGap: 0,
      supplyReady: true,
      stage: "SUPPLY_READY",
    });
    expect(snapshot.cartagena?.supplyReady).toBe(true);
  });

  it("does not count a city/coordinate mismatch as operational supply", async () => {
    const service = createService([
      {
        city: "Cartagena de Indias",
        department: "Bolívar",
        latitude: 4.711,
        longitude: -74.0721,
        serviceRadius: 10,
        isVerified: true,
        isActive: true,
        verificationStatus: VerificationStatus.APPROVED,
      },
    ]);

    const snapshot = await service.getSupplyFunnelSnapshot();
    const cartagena = snapshot.markets.find(
      (market) => market.daneCode === "13001",
    );

    expect(cartagena?.serviceAreaComplete).toBe(1);
    expect(cartagena?.geoConsistent).toBe(0);
    expect(cartagena?.operationalGeoReady).toBe(0);
    expect(cartagena?.stage).toBe("SERVICE_AREA_REQUIRED");
  });
});
