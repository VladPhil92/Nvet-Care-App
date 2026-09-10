import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CoverageService } from "./coverage.service";
import { MarketLaunchPolicyService } from "./market-launch-policy.service";

const makeVet = (city: string, department: string) => ({ city, department });

describe("MarketLaunchPolicyService", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalActiveMarkets = process.env.NVET_ACTIVE_SERVICE_MARKETS;
  const originalExpansion = process.env.NVET_NATIONAL_EXPANSION_ENABLED;
  const originalGuard = process.env.NVET_MARKET_LAUNCH_GUARD_ENABLED;

  const cartagenaVet = {
    id: "vet-cartagena",
    city: "Cartagena de Indias",
    department: "Bolívar",
  };

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalActiveMarkets === undefined) delete process.env.NVET_ACTIVE_SERVICE_MARKETS;
    else process.env.NVET_ACTIVE_SERVICE_MARKETS = originalActiveMarkets;
    if (originalExpansion === undefined) delete process.env.NVET_NATIONAL_EXPANSION_ENABLED;
    else process.env.NVET_NATIONAL_EXPANSION_ENABLED = originalExpansion;
    if (originalGuard === undefined) delete process.env.NVET_MARKET_LAUNCH_GUARD_ENABLED;
    else process.env.NVET_MARKET_LAUNCH_GUARD_ENABLED = originalGuard;
  });

  function build(options?: {
    vet?: any;
    geoReadyVets?: Array<{ city: string; department: string }>;
  }) {
    const prisma: any = {
      vetProfile: {
        findUnique: jest.fn().mockResolvedValue(options?.vet ?? cartagenaVet),
        findMany: jest.fn().mockResolvedValue(
          options?.geoReadyVets ?? [
            makeVet("Cartagena", "Bolívar"),
            makeVet("Cartagena de Indias", "Bolívar"),
            makeVet("Cartagena", "Bolivar"),
          ],
        ),
      },
    };
    const coverage = new CoverageService(prisma);
    const policy = new MarketLaunchPolicyService(prisma, coverage);
    return { prisma, coverage, policy };
  }

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.NVET_MARKET_LAUNCH_GUARD_ENABLED = "true";
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001";
    process.env.NVET_NATIONAL_EXPANSION_ENABLED = "false";
  });

  it("allows Cartagena through the launch policy when minimum geo-ready supply exists", async () => {
    const { policy } = build();

    const result = await policy.assertBookingAllowed({
      vetId: cartagenaVet.id,
      serviceLatitude: 10.4,
      serviceLongitude: -75.49,
    });

    expect(result.enforced).toBe(true);
    if (result.enforced && "evaluated" in result) {
      expect(result.evaluated).toBe(true);
    }
  });

  it("blocks Cartagena when fewer than three geo-ready vets exist", async () => {
    const { policy } = build({
      geoReadyVets: [
        makeVet("Cartagena", "Bolívar"),
        makeVet("Cartagena", "Bolívar"),
      ],
    });

    await expect(
      policy.assertBookingAllowed({
        vetId: cartagenaVet.id,
        serviceLatitude: 10.4,
        serviceLongitude: -75.49,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it("keeps Bogotá locked even if provider config requests it before national expansion is opened", async () => {
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001,11001";
    const bogotaVet = {
      id: "vet-bogota",
      city: "Bogotá D.C.",
      department: "Bogotá D.C.",
    };
    const { policy } = build({
      vet: bogotaVet,
      geoReadyVets: [
        makeVet("Bogotá", "Bogotá D.C."),
        makeVet("Bogotá D.C.", "Bogotá D.C."),
        makeVet("Bogota", "Bogota D.C."),
      ],
    });

    await expect(
      policy.assertBookingAllowed({
        vetId: bogotaVet.id,
        serviceLatitude: 4.711,
        serviceLongitude: -74.0721,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows a prepared Bogotá booking gate after expansion is deliberately opened and supply is ready", async () => {
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001,11001";
    process.env.NVET_NATIONAL_EXPANSION_ENABLED = "true";
    const bogotaVet = {
      id: "vet-bogota",
      city: "Bogotá",
      department: "Bogotá D.C.",
    };
    const { policy } = build({
      vet: bogotaVet,
      geoReadyVets: [
        makeVet("Bogotá", "Bogotá D.C."),
        makeVet("Bogotá", "Bogotá D.C."),
        makeVet("Bogotá", "Bogotá D.C."),
      ],
    });

    await expect(
      policy.assertBookingAllowed({
        vetId: bogotaVet.id,
        serviceLatitude: 4.711,
        serviceLongitude: -74.0721,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        enforced: true,
        evaluated: true,
        nationalExpansionEnabled: true,
      }),
    );
  });

  it("reports provider intent separately from effective booking eligibility", async () => {
    process.env.NVET_ACTIVE_SERVICE_MARKETS = "13001,05001";
    const { policy } = build({
      geoReadyVets: [
        makeVet("Cartagena", "Bolívar"),
        makeVet("Cartagena", "Bolívar"),
        makeVet("Cartagena", "Bolívar"),
        makeVet("Medellín", "Antioquia"),
        makeVet("Medellín", "Antioquia"),
        makeVet("Medellín", "Antioquia"),
      ],
    });

    const snapshot = await policy.getPolicySnapshot();
    const cartagena = snapshot.markets.find((market) => market.daneCode === "13001");
    const medellin = snapshot.markets.find((market) => market.daneCode === "05001");

    expect(cartagena?.bookingGateEligible).toBe(true);
    expect(cartagena?.state).toBe("BOOKING_GATE_ELIGIBLE");
    expect(medellin?.providerRequested).toBe(true);
    expect(medellin?.coverageSatisfied).toBe(true);
    expect(medellin?.bookingGateEligible).toBe(false);
    expect(medellin?.state).toBe("EXPANSION_LOCKED");
    expect(snapshot.commercialLaunchAuthorized).toBe(false);
  });
});
