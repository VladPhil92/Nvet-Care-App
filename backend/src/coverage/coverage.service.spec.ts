import { ForbiddenException } from "@nestjs/common";
import { CoverageService } from "./coverage.service";

describe("CoverageService", () => {
  const originalActiveMarkets = process.env.NVET_ACTIVE_SERVICE_MARKETS;
  const originalEnforcement = process.env.NVET_BOOKING_GEO_ENFORCEMENT;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalActiveMarkets === undefined) {
      delete process.env.NVET_ACTIVE_SERVICE_MARKETS;
    } else {
      process.env.NVET_ACTIVE_SERVICE_MARKETS = originalActiveMarkets;
    }
    if (originalEnforcement === undefined) {
      delete process.env.NVET_BOOKING_GEO_ENFORCEMENT;
    } else {
      process.env.NVET_BOOKING_GEO_ENFORCEMENT = originalEnforcement;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("keeps Cartagena active by default and future cities in prelaunch", () => {
    delete process.env.NVET_ACTIVE_SERVICE_MARKETS;
    const service = new CoverageService();
    const catalog = service.getCatalog();

    expect(
      catalog.markets.find((market) => market.daneCode === "13001")?.status,
    ).toBe("ACTIVE");
    expect(
      catalog.markets.find((market) => market.daneCode === "11001")?.status,
    ).toBe("PRELAUNCH");
  });

  it("activates a prepared market by provider configuration without code changes", () => {
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001,bogota";
    const service = new CoverageService();
    const catalog = service.getCatalog();

    expect(
      catalog.markets.find((market) => market.daneCode === "11001")?.status,
    ).toBe("ACTIVE");
  });

  it("resolves a Cartagena point into the Cartagena launch market", () => {
    const service = new CoverageService();
    const result = service.getPointCoverage(10.4, -75.5);

    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.market.daneCode).toBe("13001");
      expect(result.active).toBe(true);
    }
  });

  it("blocks booking in a prelaunch market", () => {
    process.env.NODE_ENV = "production";
    process.env.NVET_BOOKING_GEO_ENFORCEMENT = "true";
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001";
    const service = new CoverageService();

    expect(() =>
      service.assertBookableLocation({
        serviceLatitude: 4.711,
        serviceLongitude: -74.0721,
        vet: {
          city: "Bogotá D.C.",
          department: "Bogotá D.C.",
          latitude: 4.71,
          longitude: -74.07,
          serviceRadius: 15,
        },
      }),
    ).toThrow(ForbiddenException);
  });

  it("blocks an active-market booking outside the veterinarian radius", () => {
    process.env.NODE_ENV = "production";
    process.env.NVET_BOOKING_GEO_ENFORCEMENT = "true";
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001";
    const service = new CoverageService();

    expect(() =>
      service.assertBookableLocation({
        serviceLatitude: 10.52,
        serviceLongitude: -75.5,
        vet: {
          city: "Cartagena de Indias",
          department: "Bolívar",
          latitude: 10.39,
          longitude: -75.48,
          serviceRadius: 5,
        },
      }),
    ).toThrow(ForbiddenException);
  });

  it("allows an active Cartagena booking inside the veterinarian radius", () => {
    process.env.NODE_ENV = "production";
    process.env.NVET_BOOKING_GEO_ENFORCEMENT = "true";
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001";
    const service = new CoverageService();

    const result = service.assertBookableLocation({
      serviceLatitude: 10.4,
      serviceLongitude: -75.49,
      vet: {
        city: "Cartagena",
        department: "Bolívar",
        latitude: 10.39,
        longitude: -75.48,
        serviceRadius: 10,
      },
    });

    expect(result.enforced).toBe(true);
    if (result.enforced) {
      expect(result.market.daneCode).toBe("13001");
      expect(result.distanceKm).toBeLessThanOrEqual(10);
    }
  });

  it("treats Bucaramanga and Floridablanca as one metro service group when both are active", () => {
    process.env.NODE_ENV = "production";
    process.env.NVET_BOOKING_GEO_ENFORCEMENT = "true";
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "68001,68276";
    const service = new CoverageService();

    const result = service.assertBookableLocation({
      serviceLatitude: 7.075,
      serviceLongitude: -73.09,
      vet: {
        city: "Bucaramanga",
        department: "Santander",
        latitude: 7.105,
        longitude: -73.11,
        serviceRadius: 10,
      },
    });

    expect(result.enforced).toBe(true);
    if (result.enforced) expect(result.metroCoverage).toBe(true);
  });
});
