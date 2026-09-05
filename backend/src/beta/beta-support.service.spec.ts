import { BadRequestException, ConflictException } from "@nestjs/common";
import { BetaSupportService } from "./beta-support.service";

describe("BetaSupportService", () => {
  const rows: any[] = [];
  let sequence = 0;
  const prisma = {
    auditLog: {
      create: jest.fn(async ({ data }) => {
        sequence += 1;
        const row = {
          id: `support-event-${sequence}`,
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
  const actor = {
    id: "admin-user-id",
    role: "ADMIN",
    ip: "127.0.0.1",
    userAgent: "jest",
  };
  let service: BetaSupportService;

  beforeEach(() => {
    rows.length = 0;
    sequence = 0;
    jest.clearAllMocks();
    service = new BetaSupportService(prisma);
  });

  it("starts fail-closed with no support configuration", async () => {
    const snapshot = await service.getOperationalSnapshot();

    expect(snapshot.state).toBe("MISSING");
    expect(snapshot.configured).toBe(false);
    expect(snapshot.ownerConfigured).toBe(false);
    expect(snapshot.channelConfigured).toBe(false);
  });

  it("creates a time-bounded monitored support configuration", async () => {
    const result = await service.configure(
      {
        ownerRole: "Beta Operations Lead",
        channelReference: "nvet-beta-incident-channel",
        monitoringConfirmed: true,
        durationHours: 24,
      },
      actor,
    );

    expect(result.state).toBe("ACTIVE");
    expect(result.ownerRole).toBe("Beta Operations Lead");
    expect(result.channelReference).toBe("nvet-beta-incident-channel");
    expect(Date.parse(result.expiresAt as string)).toBeGreaterThan(Date.now());

    const operational = await service.getOperationalSnapshot();
    expect(operational.configured).toBe(true);
    expect(JSON.stringify(operational)).not.toContain("Beta Operations Lead");
    expect(JSON.stringify(operational)).not.toContain("nvet-beta-incident-channel");
  });

  it("rejects a second active support configuration", async () => {
    await service.configure(
      {
        ownerRole: "Beta Operations Lead",
        channelReference: "nvet-beta-incident-channel",
        monitoringConfirmed: true,
      },
      actor,
    );

    await expect(
      service.configure(
        {
          ownerRole: "Backup Operator",
          channelReference: "backup-channel",
          monitoringConfirmed: true,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("supports append-only revocation", async () => {
    await service.configure(
      {
        ownerRole: "Beta Operations Lead",
        channelReference: "nvet-beta-incident-channel",
        monitoringConfirmed: true,
      },
      actor,
    );

    const revoked = await service.revoke(
      { reason: "Shift ended and no replacement has been confirmed." },
      actor,
    );

    expect(revoked.state).toBe("REVOKED");
    expect(rows).toHaveLength(2);
    expect((await service.getOperationalSnapshot()).configured).toBe(false);
  });

  it("expires stale support leases and fails readiness closed", async () => {
    await service.configure(
      {
        ownerRole: "Beta Operations Lead",
        channelReference: "nvet-beta-incident-channel",
        monitoringConfirmed: true,
      },
      actor,
    );
    rows[0].metadata.expiresAt = new Date(Date.now() - 1000).toISOString();

    const snapshot = await service.getOperationalSnapshot();
    expect(snapshot.state).toBe("EXPIRED");
    expect(snapshot.configured).toBe(false);
    await expect(service.assertReadyForBeta()).rejects.toMatchObject({
      response: expect.objectContaining({ error: "BETA_SUPPORT_NOT_READY" }),
    });
  });

  it("rejects support references that look like embedded credentials", async () => {
    await expect(
      service.configure(
        {
          ownerRole: "Beta Operations Lead",
          channelReference: "https://ops.example.test?token=secret-value",
          monitoringConfirmed: true,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
  });
});
