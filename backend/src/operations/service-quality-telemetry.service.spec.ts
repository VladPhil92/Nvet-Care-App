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
    const scheduledAt = new Date(createdAt.getTime() + 30 * 60_000);
    return {
      status: AppointmentStatus.COMPLETED,
      date: new Date(
        `${scheduledAt.toISOString().slice(0, 10)}T00:00:00.000Z`,
      ),
      time: scheduledAt.toISOString().slice(11, 16),
      scheduledAt,
      createdAt,
      confirmedAt: new Date(createdAt.getTime() + 10 * 60_000),
      inProgressAt: scheduledAt,
      completedAt: new Date(scheduledAt.getTime() + 60 * 60_000),
      lastStatusChangeAt: new Date(scheduledAt.getTime() + 60 * 60_000),
      vet: { city: "Cartagena", department: "Bolívar" },
      transaction: {
        status: TransactionStatus.LIQUIDATED,
        paymentMethod: PaymentMethod.PSE,
        createdAt: new Date(createdAt.getTime() + 2 * 60_000),
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

  it("computes mature aggregate Cartagena telemetry without inventing VET response evidence", async () => {
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
    expect(snapshot.appointments.matureOutcomeCount).toBe(10);
    expect(snapshot.appointments.completionRatePct).toBe(100);
    expect(snapshot.latency.vetResponseMinutes.sampleSize).toBe(0);
    expect(snapshot.latency.semantics.vetResponseMeasured).toBe(false);
    expect(snapshot.latency.bookingConfirmationMinutes.p95Minutes).toBe(10);
    expect(snapshot.latency.serviceStartDelayMinutes.p95Minutes).toBe(0);
    expect(snapshot.payments.statusCounts.LIQUIDATED).toBe(10);
    expect(snapshot.slo.overall).toBe("HEALTHY");
    expect(snapshot.boundaries.aggregateOnly).toBe(true);
    expect(snapshot.boundaries.exposesUserIdentifiers).toBe(false);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('"clientId":');
    expect(serialized).not.toContain('"vetId":');
  });

  it("does not claim SLO health before every required metric has enough sample", async () => {
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

  it("keeps future bookings outside the mature completion denominator", async () => {
    const future = new Date("2026-09-25T18:00:00.000Z");
    prisma.appointment.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) =>
        appointment(index, {
          status: AppointmentStatus.PENDING,
          scheduledAt: new Date(future.getTime() + index * 60_000),
          date: new Date("2026-09-25T00:00:00.000Z"),
          time: "13:00",
          confirmedAt: null,
          inProgressAt: null,
          completedAt: null,
          lastStatusChangeAt: null,
          transaction: null,
        }),
      ),
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.appointments.total).toBe(10);
    expect(snapshot.appointments.matureOutcomeCount).toBe(0);
    expect(snapshot.appointments.completionRatePct).toBeNull();
    expect(snapshot.slo.overall).toBe("INSUFFICIENT_DATA");
  });

  it("censors overdue missing service starts instead of hiding them", async () => {
    const overdueScheduled = new Date("2026-09-20T16:00:00.000Z");
    prisma.appointment.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) =>
        appointment(index, {
          status: AppointmentStatus.CONFIRMED,
          scheduledAt: overdueScheduled,
          inProgressAt: null,
          completedAt: null,
          lastStatusChangeAt: overdueScheduled,
        }),
      ),
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.latency.serviceStartDelayMinutes.censoredSampleSize).toBe(10);
    expect(snapshot.latency.serviceStartDelayMinutes.overdueWithoutEvent).toBe(10);
    expect(snapshot.slo.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "service-start-delay-p95",
          state: "BREACHED",
        }),
      ]),
    );
    expect(snapshot.slo.overall).toBe("BREACHED");
  });

  it("marks mature cancellation and resolved payment failures as breached", async () => {
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
            verifiedAt: null,
            liquidatedAt: null,
          },
        });
      }
      return appointment(index);
    });
    prisma.appointment.findMany.mockResolvedValue(rows);

    const snapshot = await service.getSnapshot();

    expect(snapshot.appointments.cancellationRatePct).toBe(80);
    expect(snapshot.payments.failureRatePct).toBe(80);
    expect(snapshot.slo.overall).toBe("BREACHED");
    expect(snapshot.operatorAction).toBe("REMEDIATE_SLO_BREACHES");
  });

  it("does not treat pending payments as successful evidence or failures", async () => {
    prisma.appointment.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) =>
        appointment(index, {
          transaction: {
            status: TransactionStatus.PENDING,
            paymentMethod: PaymentMethod.PSE,
            createdAt: minutesAfter(index * 120),
            verifiedAt: null,
            liquidatedAt: null,
          },
        }),
      ),
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.payments.resolvedTransactions).toBe(0);
    expect(snapshot.payments.failureRatePct).toBeNull();
    expect(snapshot.slo.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "payment-failure-rate",
          state: "INSUFFICIENT_DATA",
        }),
      ]),
    );
    expect(snapshot.slo.overall).toBe("INSUFFICIENT_DATA");
  });

  it("surfaces persisted timestamp integrity problems instead of synthesizing data", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => appointment(index));
    rows[0] = appointment(0, {
      status: AppointmentStatus.COMPLETED,
      inProgressAt: null,
      completedAt: null,
    });
    prisma.appointment.findMany.mockResolvedValue(rows);

    const snapshot = await service.getSnapshot();

    expect(snapshot.dataQuality.appointmentsWithIssues).toBe(1);
    expect(snapshot.dataQuality.categories.missingInProgressTimestamp).toBe(1);
    expect(snapshot.dataQuality.categories.missingCompletedTimestamp).toBe(1);
    expect(snapshot.dataQuality.measurementIntegrity.noSyntheticTimestamps).toBe(
      true,
    );
    expect(snapshot.operatorAction).toBe("REVIEW_TELEMETRY_DATA_INTEGRITY");
  });

  it("treats missing financial confirmation timestamps as coverage gaps, not VET-response failures", async () => {
    prisma.appointment.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) =>
        appointment(index, {
          status: AppointmentStatus.CONFIRMED,
          confirmedAt: null,
          scheduledAt: new Date("2026-09-25T18:00:00.000Z"),
          inProgressAt: null,
          completedAt: null,
          lastStatusChangeAt: null,
        }),
      ),
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.dataQuality.categories.missingConfirmedTimestamp).toBe(10);
    expect(snapshot.dataQuality.appointmentsWithIssues).toBe(0);
    expect(snapshot.latency.vetResponseMinutes.sampleSize).toBe(0);
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
