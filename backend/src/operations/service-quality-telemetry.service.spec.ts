import {
  AppointmentStatus,
  PaymentMethod,
  TransactionStatus,
} from "@prisma/client";
import { ServiceQualityTelemetryService } from "./service-quality-telemetry.service";

describe("ServiceQualityTelemetryService", () => {
  const prisma = {
    appointment: {
      findMany: jest.fn(),
    },
  } as any;
  const coverage = {
    getCatalog: jest.fn(),
    resolveMarketByCity: jest.fn(),
  } as any;
  const launchOperations = {
    getSnapshot: jest.fn(),
  } as any;
  let service: ServiceQualityTelemetryService;

  const baseTime = new Date("2026-09-10T18:00:00.000Z");
  const minutesAfter = (value: number) =>
    new Date(baseTime.getTime() + value * 60_000);

  function appointment(
    index: number,
    overrides: Record<string, unknown> = {},
  ) {
    const createdAt = minutesAfter(index * 120);
    return {
      status: AppointmentStatus.COMPLETED,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 150 * 60_000),
      confirmedAt: new Date(createdAt.getTime() + 10 * 60_000),
      inProgressAt: new Date(createdAt.getTime() + 30 * 60_000),
      completedAt: new Date(createdAt.getTime() + 90 * 60_000),
      lastStatusChangeAt: new Date(createdAt.getTime() + 90 * 60_000),
      vet: { city: "Cartagena", department: "Bolívar" },
      transaction: {
        status: TransactionStatus.LIQUIDATED,
        paymentMethod: PaymentMethod.PSE,
        createdAt: new Date(createdAt.getTime() + 2 * 60_000),
        updatedAt: new Date(createdAt.getTime() + 45 * 60_000),
        verifiedAt: new Date(createdAt.getTime() + 5 * 60_000),
        liquidatedAt: new Date(createdAt.getTime() + 40 * 60_000),
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-20T18:00:00.000Z"));
    jest.clearAllMocks();
    service = new ServiceQualityTelemetryService(
      prisma,
      coverage,
      launchOperations,
    );
    coverage.getCatalog.mockReturnValue({
      markets: [
        {
          code: "CTG",
          daneCode: "13001",
          city: "Cartagena de Indias",
          department: "Bolívar",
        },
        {
          code: "BOG",
          daneCode: "11001",
          city: "Bogotá",
          department: "Bogotá D.C.",
        },
      ],
    });
    coverage.resolveMarketByCity.mockImplementation((city: string | null) =>
      city?.toLowerCase().includes("cartagena")
        ? { daneCode: "13001" }
        : city?.toLowerCase().includes("bogot")
          ? { daneCode: "11001" }
          : null,
    );
    launchOperations.getSnapshot.mockResolvedValue({
      decision: { effective: "GO" },
      observation: { state: "ACTIVE", daysElapsed: 2.5 },
      runtime: { closedBetaEnabled: true },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("computes aggregate Cartagena service-quality telemetry without identifiers", async () => {
    prisma.appointment.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => appointment(index)),
    );

    const snapshot = await service.getSnapshot({
      marketDaneCode: "13001",
      windowHours: 168,
    });

    expect(snapshot.phase).toBe(26);
    expect(snapshot.market.daneCode).toBe("13001");
    expect(snapshot.appointments.total).toBe(10);
    expect(snapshot.appointments.completedEver).toBe(10);
    expect(snapshot.appointments.completionRatePct).toBe(100);
    expect(snapshot.latency.vetResponseMinutes.p95Minutes).toBe(10);
    expect(snapshot.payments.statusCounts.LIQUIDATED).toBe(10);
    expect(snapshot.slo.overall).toBe("HEALTHY");
    expect(snapshot.boundaries.aggregateOnly).toBe(true);
    expect(snapshot.boundaries.exposesUserIdentifiers).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("clientId");
    expect(JSON.stringify(snapshot)).not.toContain("vetId");
  });

  it("does not claim SLO health before the minimum sample exists", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      appointment(0),
      appointment(1),
      appointment(2),
    ]);

    const snapshot = await service.getSnapshot();

    expect(snapshot.appointments.total).toBe(3);
    expect(snapshot.slo.overall).toBe("INSUFFICIENT_DATA");
    expect(snapshot.operatorAction).toBe("ACCUMULATE_CONTROLLED_BETA_SAMPLE");
    expect(snapshot.slo.targetsAreCustomerPromises).toBe(false);
    expect(snapshot.slo.automaticallyChangesLaunchDecision).toBe(false);
  });

  it("marks degraded response and cancellation outcomes as breached", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => {
      if (index < 8) {
        const createdAt = minutesAfter(index * 120);
        return appointment(index, {
          status: AppointmentStatus.CANCELLED,
          confirmedAt: null,
          inProgressAt: null,
          completedAt: null,
          lastStatusChangeAt: new Date(createdAt.getTime() + 80 * 60_000),
          transaction: {
            status: TransactionStatus.FAILED,
            paymentMethod: PaymentMethod.PSE,
            createdAt,
            updatedAt: new Date(createdAt.getTime() + 70 * 60_000),
            verifiedAt: null,
            liquidatedAt: null,
          },
        });
      }
      const createdAt = minutesAfter(index * 120);
      return appointment(index, {
        confirmedAt: new Date(createdAt.getTime() + 120 * 60_000),
      });
    });
    prisma.appointment.findMany.mockResolvedValue(rows);

    const snapshot = await service.getSnapshot();

    expect(snapshot.appointments.cancellationRatePct).toBe(80);
    expect(snapshot.payments.failureRatePct).toBe(80);
    expect(snapshot.slo.overall).toBe("BREACHED");
    expect(snapshot.slo.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "cancellation-rate", state: "BREACHED" }),
        expect.objectContaining({ id: "payment-failure-rate", state: "BREACHED" }),
      ]),
    );
    expect(snapshot.operatorAction).toBe("REMEDIATE_SLO_BREACHES");
  });

  it("surfaces persisted timestamp integrity problems instead of synthesizing data", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => appointment(index));
    rows[0] = appointment(0, {
      status: AppointmentStatus.COMPLETED,
      confirmedAt: null,
      inProgressAt: null,
      completedAt: null,
    });
    prisma.appointment.findMany.mockResolvedValue(rows);

    const snapshot = await service.getSnapshot();

    expect(snapshot.dataQuality.appointmentsWithIssues).toBe(1);
    expect(snapshot.dataQuality.categories.missingConfirmedTimestamp).toBe(1);
    expect(snapshot.dataQuality.categories.missingInProgressTimestamp).toBe(1);
    expect(snapshot.dataQuality.categories.missingCompletedTimestamp).toBe(1);
    expect(snapshot.dataQuality.measurementIntegrity.noSyntheticTimestamps).toBe(
      true,
    );
    expect(snapshot.operatorAction).toBe("REVIEW_TELEMETRY_DATA_INTEGRITY");
  });

  it("filters records by the canonical coverage market resolver", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      appointment(0),
      appointment(1, {
        vet: { city: "Bogotá", department: "Bogotá D.C." },
      }),
      appointment(2, {
        vet: { city: "Unknown", department: null },
      }),
    ]);

    const snapshot = await service.getSnapshot({ marketDaneCode: "13001" });

    expect(snapshot.appointments.total).toBe(1);
    expect(snapshot.dataQuality.unresolvedMarketAppointmentsInWindow).toBe(1);
  });

  it("rejects unknown markets and windows outside the bounded telemetry range", async () => {
    await expect(
      service.getSnapshot({ marketDaneCode: "99999" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: "SERVICE_QUALITY_MARKET_UNSUPPORTED",
      }),
    });

    await expect(service.getSnapshot({ windowHours: 721 })).rejects.toMatchObject(
      {
        response: expect.objectContaining({
          error: "SERVICE_QUALITY_WINDOW_INVALID",
        }),
      },
    );
  });
});
