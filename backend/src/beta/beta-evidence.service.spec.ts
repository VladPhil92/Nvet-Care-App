import { ConflictException } from "@nestjs/common";
import { BetaEvidenceService } from "./beta-evidence.service";

describe("BetaEvidenceService", () => {
  const rows: any[] = [];
  let sequence = 0;
  const prisma = {
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
              row.targetType === where.targetType &&
              row.action === where.action &&
              (!where.targetId || row.targetId === where.targetId),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      ),
    },
  } as any;

  const actor = {
    id: "admin-user-id",
    role: "ADMIN",
    ip: "127.0.0.1",
    userAgent: "jest",
  };

  let service: BetaEvidenceService;

  beforeEach(() => {
    rows.length = 0;
    sequence = 0;
    jest.clearAllMocks();
    service = new BetaEvidenceService(prisma);
  });

  it("submits and approves evidence through the append-only audit ledger", async () => {
    const submitted = await service.submit(
      {
        gate: "productionBackupConfigured",
        environment: "production",
        reference: "railway-backup-audit-2026-09-03",
        observedAt: new Date(Date.now() - 60_000).toISOString(),
      },
      actor,
    );

    expect(submitted.status).toBe("PENDING");
    expect(submitted.referenceSha256).toHaveLength(64);

    const approved = await service.approve(submitted.evidenceId, {}, actor);
    expect(approved.status).toBe("APPROVED");
    expect(approved.eventCount).toBe(2);
    expect(rows).toHaveLength(2);

    const summary = await service.getPromotionSummary();
    expect(summary.verifiedGates).toBe(1);
    expect(summary.eligibleForOperatorActivation).toBe(false);
  });

  it("supports explicit revocation only after approval", async () => {
    const submitted = await service.submit(
      {
        gate: "supportOwnerConfirmed",
        environment: "production",
        reference: "support-approval-ops-42",
        observedAt: new Date(Date.now() - 60_000).toISOString(),
      },
      actor,
    );

    await service.approve(submitted.evidenceId, {}, actor);
    const revoked = await service.revoke(
      submitted.evidenceId,
      { reason: "Support route is no longer monitored." },
      actor,
    );
    expect(revoked.status).toBe("REVOKED");
  });

  it("rejects a second terminal decision", async () => {
    const submitted = await service.submit(
      {
        gate: "privacyAndTermsReviewed",
        environment: "production",
        reference: "legal-review-2026-09-03",
        observedAt: new Date(Date.now() - 60_000).toISOString(),
      },
      actor,
    );
    await service.reject(submitted.evidenceId, { reason: "Changes required." }, actor);

    await expect(service.approve(submitted.evidenceId, {}, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("marks time-bounded evidence expired and blocks approval", async () => {
    const observedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() - 60 * 60 * 1000);
    const submitted = await service.submit(
      {
        gate: "paymentRailVerified",
        environment: "production",
        reference: "payment-drill-legacy",
        observedAt: observedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      actor,
    );

    expect(submitted.status).toBe("EXPIRED");
    await expect(service.approve(submitted.evidenceId, {}, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("never accepts a reference that appears to contain credentials", async () => {
    await expect(
      service.submit(
        {
          gate: "restoreDrillVerified",
          environment: "staging",
          reference: "provider?token=super-secret",
          observedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        actor,
      ),
    ).rejects.toThrow("credential or secret");
    expect(rows).toHaveLength(0);
  });
});
