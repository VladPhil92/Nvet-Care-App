import { AuditAction } from "@prisma/client";
import { ReleaseHealthService } from "./release-health.service";

function runtimeSnapshot(input?: {
  apiFailureRatePct?: number | null;
  apiSampleSize?: number;
  authLatencyP95Ms?: number | null;
  authSampleSize?: number;
  ctgLatencyP95Ms?: number | null;
  ctgSampleSize?: number;
}) {
  return {
    api: {
      failureRatePct: input?.apiFailureRatePct ?? null,
      sampleSize: input?.apiSampleSize ?? 0,
    },
    authClient: {
      latencyP95Ms: input?.authLatencyP95Ms ?? null,
      sampleSize: input?.authSampleSize ?? 0,
    },
    ctgFederationClient: {
      latencyP95Ms: input?.ctgLatencyP95Ms ?? null,
      sampleSize: input?.ctgSampleSize ?? 0,
    },
  };
}

function buildService(input?: {
  auditRows?: Array<{ action: AuditAction; reason: string | null; createdAt: Date }>;
  runtime?: ReturnType<typeof runtimeSnapshot>;
  serviceQualityOverall?: "HEALTHY" | "WATCH" | "BREACHED" | "INSUFFICIENT_DATA";
  betaEligible?: boolean;
  backendStatus?: "ok" | "degraded" | "down";
}) {
  const prisma = {
    auditLog: {
      findMany: jest.fn().mockResolvedValue(input?.auditRows ?? []),
    },
  };
  const runtime = {
    getSnapshot: jest.fn().mockReturnValue(input?.runtime ?? runtimeSnapshot()),
  };
  const serviceQuality = {
    getSnapshot: jest.fn().mockResolvedValue({
      slo: {
        overall: input?.serviceQualityOverall ?? "HEALTHY",
        minimumSampleSize: 10,
        metrics: [],
      },
    }),
  };
  const betaEvidence = {
    getPromotionSummary: jest.fn().mockResolvedValue({
      eligibleForOperatorActivation: input?.betaEligible ?? false,
      verifiedGates: input?.betaEligible ? 4 : 0,
      pendingGates: input?.betaEligible ? 0 : 4,
      conflictedGates: 0,
      appendOnly: true,
    }),
  };
  const health = {
    getReadiness: jest.fn().mockResolvedValue({
      status: input?.backendStatus ?? "ok",
      revision: "abc1234",
      checks: { database: { status: "up" } },
    }),
  };

  return new ReleaseHealthService(
    prisma as any,
    runtime as any,
    serviceQuality as any,
    betaEvidence as any,
    health as any,
  );
}

describe("ReleaseHealthService", () => {
  it("stays OBSERVING when real samples/evidence are insufficient", async () => {
    const service = buildService();

    const snapshot = await service.getSnapshot(24);

    expect(snapshot.decision).toBe("OBSERVING");
    expect(snapshot.releaseHealth.releasePromotionEligible).toBe(false);
    expect(snapshot.externalEvidence.realBetaCohort).toBe("operator-required");
    expect(snapshot.boundaries.automaticBetaEvidenceApproval).toBe(false);
    expect(snapshot.boundaries.commercialLaunchAuthorized).toBe(false);
  });

  it("blocks release health when authenticated-session success breaches the target", async () => {
    const now = new Date();
    const auditRows = [
      ...Array.from({ length: 19 }, () => ({
        action: AuditAction.LOGIN_SUCCESS,
        reason: "login_password_ok",
        createdAt: now,
      })),
      {
        action: AuditAction.LOGIN_FAILED,
        reason: "invalid_password",
        createdAt: now,
      },
    ];
    const service = buildService({ auditRows });

    const snapshot = await service.getSnapshot(24);

    expect(snapshot.decision).toBe("BLOCKED");
    expect(snapshot.releaseHealth.breachedMetricIds).toContain(
      "authenticated-session-success-rate",
    );
  });

  it("reaches operator beta review only after all measured gates pass", async () => {
    const now = new Date();
    const auditRows = Array.from({ length: 20 }, () => ({
      action: AuditAction.LOGIN_SUCCESS,
      reason: "login_ctg_identity_exchange",
      createdAt: now,
    }));
    const service = buildService({
      auditRows,
      betaEligible: true,
      runtime: runtimeSnapshot({
        apiFailureRatePct: 0,
        apiSampleSize: 20,
        authLatencyP95Ms: 1000,
        authSampleSize: 20,
        ctgLatencyP95Ms: 2000,
        ctgSampleSize: 20,
      }),
    });

    const snapshot = await service.getSnapshot(24);

    expect(snapshot.decision).toBe("READY_FOR_OPERATOR_BETA_REVIEW");
    expect(snapshot.releaseHealth.breachedMetricIds).toEqual([]);
    expect(snapshot.releaseHealth.insufficientMetricIds).toEqual([]);
    expect(snapshot.releaseHealth.releasePromotionEligible).toBe(true);
    expect(snapshot.boundaries.automaticPublicRollout).toBe(false);
  });
});
