import { ServiceUnavailableException } from "@nestjs/common";
import { CoverageService } from "./coverage.service";

describe("CoverageService veterinarian service-area consistency", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMarkets = process.env.NVET_ACTIVE_SERVICE_MARKETS;
  const originalGeo = process.env.NVET_BOOKING_GEO_ENFORCEMENT;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001";
    process.env.NVET_BOOKING_GEO_ENFORCEMENT = "true";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalMarkets === undefined) delete process.env.NVET_ACTIVE_SERVICE_MARKETS;
    else process.env.NVET_ACTIVE_SERVICE_MARKETS = originalMarkets;
    if (originalGeo === undefined) delete process.env.NVET_BOOKING_GEO_ENFORCEMENT;
    else process.env.NVET_BOOKING_GEO_ENFORCEMENT = originalGeo;
  });

  it("accepts a service center whose coordinates resolve to the declared market", () => {
    const service = new CoverageService();
    expect(
      service.isVetServiceAreaConsistent({
        city: "Cartagena de Indias",
        department: "Bolívar",
        latitude: 10.4,
        longitude: -75.49,
        serviceRadius: 10,
      }),
    ).toBe(true);
  });

  it("rejects a service center whose coordinates resolve to a different market", () => {
    const service = new CoverageService();
    expect(
      service.isVetServiceAreaConsistent({
        city: "Cartagena de Indias",
        department: "Bolívar",
        latitude: 4.711,
        longitude: -74.0721,
        serviceRadius: 10,
      }),
    ).toBe(false);
  });

  it("fails booking closed when a vet declares Cartagena but stores Bogotá coordinates", () => {
    const service = new CoverageService();

    expect(() =>
      service.assertBookableLocation({
        serviceLatitude: 10.4,
        serviceLongitude: -75.49,
        vet: {
          city: "Cartagena de Indias",
          department: "Bolívar",
          latitude: 4.711,
          longitude: -74.0721,
          serviceRadius: 20,
        },
      }),
    ).toThrow(ServiceUnavailableException);
  });
});
