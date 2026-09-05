import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { BetaActivationService } from "./beta-activation.service";

describe("BetaActivationService", () => {
  const originalEnv = process.env;
  const rows: any[] = [];
  let sequence = 0;
  const prisma = {
    vetProfile: {
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn(async ({ data }) => {
        sequence += 1;
        const row = {
          id: `event-${sequence}`,
          ...data,
          createdAt: new Date(Date.now() + sequence),
        };
        rows.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }) =>
        rows
          .filter(
            (row) =>
              row.targetType === where.targetType && row.action === where.action,
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      ),
    },
  } as any;
  const evidence = {
    getPromotionSummary: jest.fn(),
  } as any;
  const cohort = {
    getOperationalSnapshot: jest.fn(),
  } as any;
  const support = {
    getOperationalSnapshot: jest.fn(),
  } as any;
  const actor = {
    id: "admin-user-id",
    role: "ADMIN",
    ip: "127.0.0.1",
    userAgent: "jest",
  };
  let service: BetaActivationService;

  const healthyCohort = () => ({
    ledger: "audit_logs",
    appendOnly: true,
    activeMemberships: 2,
    eligibleActiveMembers: 2,
    ineligibleMembers: 0,
    maxInitialClients: 50,
    remainingSlots: 48,
    withinLimit: true,
    configured: true,
  });

  const healthySupport = () => ({
    state: "ACTIVE",
    configured: true,
    ownerConfigured: true,
    channelConfigured: true,
    monitoringConfirmed: true,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    criticalIncidentTargetMinutes: 30,
    ledger: "audit_logs",
    appendOnly: true,
    configurationSource: "admin-control-plane",
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NVET_CLOSED_BETA_MARKET = "Cartagena de Indias";
    rows.length = 0;
    sequence = 0;
    jest.clearAllMocks();
    prisma.vetProfile.count.mockResolvedValue(3);
    evidence.getPromotionSummary.mockResolvedValue({
      eligibleForOperatorActivation: true,
    });
    cohort.getOperationalSnapshot.mockResolvedValue(healthyCohort());
    support.getOperationalSnapshot.mockResolvedValue(healthySupport());
    service = new BetaActivationService(prisma, evidence, cohort, support);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("issues a time-bounded authorization only when all prerequisites pass", async () => {
    const result = await service.authorize({ durationHours: 24 }, actor);

    expect(result.state).toBe("ACTIVE");
    expect(result.authorizationId).toBeTruthy();
    expect(Date.parse(result.expiresAt as string)).toBeGreaterThan(Date.now());
    expect(rows).toHaveLength(1);
  });

  it("refuses authorization when production evidence is incomplete", async () => {
    evidence.getPromotionSummary.mockResolvedValue({
      eligibleForOperatorActivation: false,
    });

    await expect(service.authorize({}, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(rows).toHaveLength(0);
  });

  it("detects veterinarian prerequisite drift and blocks bookings after authorization", async () => {
    await service.authorize({}, actor);
    prisma.vetProfile.count.mockResolvedValue(2);

    await expect(service.assertActiveForBooking()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("detects cohort eligibility drift and blocks bookings after authorization", async () => {
    await service.authorize({}, actor);
    cohort.getOperationalSnapshot.mockResolvedValue({
      ...healthyCohort(),
      eligibleActiveMembers: 1,
      ineligibleMembers: 1,
    });

    const prerequisites = await service.getPrerequisites();
    expect(prerequisites.blockers).toContain("COHORT_MEMBER_INELIGIBLE");
    await expect(service.assertActiveForBooking()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("detects support lease drift and blocks bookings after authorization", async () => {
    await service.authorize({}, actor);
    support.getOperationalSnapshot.mockResolvedValue({
      ...healthySupport(),
      state: "EXPIRED",
      configured: false,
    });

    const prerequisites = await service.getPrerequisites();
    expect(prerequisites.supportState).toBe("EXPIRED");
    expect(prerequisites.blockers).toContain("SUPPORT_NOT_CONFIGURED");
    await expect(service.assertActiveForBooking()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("supports append-only revocation", async () => {
    await service.authorize({}, actor);
    const revoked = await service.revoke(
      { reason: "Operator rollback drill." },
      actor,
    );

    expect(revoked.state).toBe("REVOKED");
    expect(rows).toHaveLength(2);
  });

  it("rejects a second active authorization", async () => {
    await service.authorize({}, actor);

    await expect(service.authorize({}, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
