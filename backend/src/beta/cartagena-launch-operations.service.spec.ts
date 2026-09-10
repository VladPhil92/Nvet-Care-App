import { AuditAction } from "@prisma/client";
import { CartagenaLaunchOperationsService } from "./cartagena-launch-operations.service";

describe("CartagenaLaunchOperationsService", () => {
  const prisma = {
    auditLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  } as any;
  const launchReadiness = { getSnapshot: jest.fn() } as any;
  const activation = { getStatus: jest.fn() } as any;
  const evidence = { getHistory: jest.fn() } as any;
  const support = { getOperationalSnapshot: jest.fn() } as any;
  let service: CartagenaLaunchOperationsService;

  const readiness = {
    market: {
      code: "CTG",
      daneCode: "13001",
      city: "Cartagena de Indias",
      department: "Bolívar",
    },
    decision: {
      state: "GO" as const,
      blockers: [] as string[],
    },
    progress: {
      verifiedEvidenceGates: 10,
      totalEvidenceGates: 10,
    },
    runtime: {
      closedBetaEnabled: false,
      bookingEnabled: true,
      authorizationActive: true,
      authorizationExpiresAt: "2026-09-12T12:00:00.000Z",
      marketGuardEnabled: true,
      cartagenaBookingGateEligible: true,
    },
    supply: {
      strictSupplySatisfied: true,
      operationalReadyVets: 3,
      minimumRequiredVets: 3,
      coverageGap: 0,
      source: "GET /api/coverage/cartagena-activation",
    },
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-10T16:00:00.000Z"));
    jest.clearAllMocks();
    service = new CartagenaLaunchOperationsService(
      prisma,
      launchReadiness,
      activation,
      evidence,
      support,
    );
    launchReadiness.getSnapshot.mockResolvedValue(readiness);
    activation.getStatus.mockResolvedValue({
      state: "ACTIVE",
      authorizationId: "auth-1",
      authorizedAt: "2026-09-10T14:00:00.000Z",
      expiresAt: "2026-09-12T12:00:00.000Z",
      revokedAt: null,
    });
    evidence.getHistory.mockResolvedValue({ evidence: [] });
    support.getOperationalSnapshot.mockResolvedValue({
      state: "ACTIVE",
      configured: true,
      expiresAt: null,
    });
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.create.mockResolvedValue({ id: "log-1" });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps GO before activation because observation tracking is not yet required", async () => {
    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.phase24).toBe("GO");
    expect(snapshot.decision.effective).toBe("GO");
    expect(snapshot.observation.state).toBe("MISSING");
    expect(snapshot.observation.requiredWhenClosedBetaEnabled).toBe(true);
    expect(snapshot.decision.commercialLaunchAuthorized).toBe(false);
  });

  it("fails closed when beta is active without an observation ledger", async () => {
    launchReadiness.getSnapshot.mockResolvedValue({
      ...readiness,
      runtime: { ...readiness.runtime, closedBetaEnabled: true },
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.effective).toBe("HOLD");
    expect(snapshot.decision.blockers).toContain(
      "ACTIVE_BETA_OBSERVATION_NOT_TRACKED",
    );
    expect(snapshot.decision.operatorAction).toBe(
      "START_OR_RECONCILE_OBSERVATION_WINDOW",
    );
  });

  it("classifies an active observation as eligible to close after seven days", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        targetId: "obs-1",
        createdAt: new Date("2026-09-02T16:00:00.000Z"),
        metadata: {
          schemaVersion: 1,
          program: "cartagena-launch-operations-phase-25",
          eventType: "STARTED",
          minimumObservationDays: 7,
          baselineDecision: "GO",
          reason: "Start controlled beta observation",
        },
      },
    ]);

    const observation = await service.getObservationStatus();

    expect(observation.state).toBe("ELIGIBLE_TO_CLOSE");
    expect(observation.observationId).toBe("obs-1");
    expect(observation.daysElapsed).toBeGreaterThanOrEqual(7);
  });

  it("surfaces critical lease expiry without automatically mutating runtime", async () => {
    activation.getStatus.mockResolvedValue({
      state: "ACTIVE",
      authorizationId: "auth-1",
      authorizedAt: "2026-09-10T14:00:00.000Z",
      expiresAt: "2026-09-10T18:00:00.000Z",
      revokedAt: null,
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.expiryWatch.state).toBe("CRITICAL");
    expect(snapshot.expiryWatch.criticalCount).toBe(1);
    expect(snapshot.decision.operatorAction).toBe(
      "RENEW_OR_REPLACE_EXPIRING_CONTROLS",
    );
    expect(snapshot.decision.automaticallyMutatesRuntime).toBe(false);
    expect(snapshot.boundaries.expiryWatchIsReadOnly).toBe(true);
  });

  it("propagates the Phase 24 PAUSE decision", async () => {
    launchReadiness.getSnapshot.mockResolvedValue({
      ...readiness,
      decision: { state: "PAUSE" as const, blockers: [] },
      runtime: {
        ...readiness.runtime,
        closedBetaEnabled: true,
        bookingEnabled: false,
      },
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.decision.effective).toBe("PAUSE");
    expect(snapshot.decision.operatorAction).toBe(
      "KEEP_BOOKING_PAUSED_AND_REMEDIATE",
    );
  });

  it("writes observation start as append-only audit evidence only after live GO", async () => {
    launchReadiness.getSnapshot.mockResolvedValue({
      ...readiness,
      runtime: { ...readiness.runtime, closedBetaEnabled: true },
    });
    prisma.auditLog.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          targetId: "obs-created",
          createdAt: new Date("2026-09-10T16:00:00.000Z"),
          metadata: {
            schemaVersion: 1,
            program: "cartagena-launch-operations-phase-25",
            eventType: "STARTED",
            minimumObservationDays: 7,
            baselineDecision: "GO",
            reason: "Begin beta observation",
          },
        },
      ]);

    await service.startObservation(
      { reason: "Begin beta observation" },
      { id: "admin-1", role: "ADMIN" },
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.CONFIG_CHANGED,
          targetType: "BETA_CARTAGENA_OBSERVATION",
          metadata: expect.objectContaining({ eventType: "STARTED" }),
        }),
      }),
    );
  });
});
