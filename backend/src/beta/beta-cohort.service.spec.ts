import {
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { AuditAction, UserRole } from "@prisma/client";
import { BetaCohortService } from "./beta-cohort.service";

const client = (overrides: Record<string, unknown> = {}) => ({
  id: "client-1",
  email: "client@example.com",
  firstName: "Ana",
  lastName: "Cliente",
  role: UserRole.CLIENT,
  isActive: true,
  emailVerified: true,
  ...overrides,
});

describe("BetaCohortService", () => {
  const rows: any[] = [];
  const users = new Map<string, any>();
  let sequence = 0;

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.email) {
          return (
            [...users.values()].find((user) => user.email === where.email) ?? null
          );
        }
        return users.get(where.id) ?? null;
      }),
      findMany: jest.fn(async ({ where }) =>
        (where?.id?.in ?? [])
          .map((id: string) => users.get(id))
          .filter(Boolean),
      ),
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
      findMany: jest.fn(async ({ where, take }) =>
        rows
          .filter(
            (row) =>
              row.action === where.action &&
              row.targetType === where.targetType &&
              (!where.targetId || row.targetId === where.targetId),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, take),
      ),
    },
  } as any;

  const legal = {
    getStatus: jest.fn(async () => ({
      accepted: false,
      acceptedAt: null,
      terms: { version: "beta-1" },
      privacy: { version: "beta-1" },
    })),
  } as any;

  const actor = {
    id: "admin-1",
    role: "ADMIN",
    ip: "127.0.0.1",
    userAgent: "jest",
  };

  let service: BetaCohortService;

  beforeEach(() => {
    rows.length = 0;
    users.clear();
    users.set("client-1", client());
    sequence = 0;
    jest.clearAllMocks();
    service = new BetaCohortService(prisma, legal);
  });

  it("invites a verified active CLIENT through an append-only audit event", async () => {
    const result = await service.invite(
      { email: "CLIENT@example.com", reason: "Initial Cartagena cohort." },
      actor,
    );

    expect(result.status).toBe("ACTIVE");
    expect(result.email).toBe("client@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe(AuditAction.CONFIG_CHANGED);
    expect(rows[0].targetId).toBe("client-1");
    expect(rows[0].metadata.eventType).toBe("INVITED");
    expect(JSON.stringify(rows[0].metadata)).not.toContain("client@example.com");
  });

  it("rejects unverified accounts before creating cohort evidence", async () => {
    users.set("client-1", client({ emailVerified: false }));

    await expect(
      service.invite({ email: "client@example.com" }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rows).toHaveLength(0);
  });

  it("rejects duplicate active invitations", async () => {
    await service.invite({ email: "client@example.com" }, actor);

    await expect(
      service.invite({ email: "client@example.com" }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rows).toHaveLength(1);
  });

  it("supports append-only revoke and re-invite", async () => {
    const invited = await service.invite({ email: "client@example.com" }, actor);
    const revoked = await service.revoke(
      invited.userId,
      { reason: "Client requested removal." },
      actor,
    );
    expect(revoked.status).toBe("REVOKED");

    const reinvited = await service.invite(
      { email: "client@example.com", reason: "Client opted in again." },
      actor,
    );
    expect(reinvited.status).toBe("ACTIVE");
    expect(rows.map((row) => row.metadata.eventType)).toEqual([
      "INVITED",
      "REVOKED",
      "INVITED",
    ]);
  });

  it("blocks invitations once the 50-member cap is reached", async () => {
    jest.spyOn(service, "getOperationalSnapshot").mockResolvedValue({
      ledger: "audit_logs",
      appendOnly: true,
      activeMemberships: 50,
      eligibleActiveMembers: 50,
      ineligibleMembers: 0,
      maxInitialClients: 50,
      remainingSlots: 0,
      withinLimit: true,
      configured: true,
    });

    await expect(
      service.invite({ email: "client@example.com" }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rows).toHaveLength(0);
  });

  it("fails booking membership when the account becomes ineligible", async () => {
    await service.invite({ email: "client@example.com" }, actor);
    users.set("client-1", client({ isActive: false }));

    await expect(service.assertActiveMember("client-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("returns an admin snapshot with live legal status and no cohort hashes", async () => {
    legal.getStatus.mockResolvedValue({
      accepted: true,
      acceptedAt: "2026-09-03T12:00:00.000Z",
    });
    await service.invite({ email: "client@example.com" }, actor);

    const snapshot = await service.getAdminSnapshot();

    expect(snapshot.activeMemberships).toBe(1);
    expect(snapshot.members[0]).toMatchObject({
      userId: "client-1",
      email: "client@example.com",
      eligible: true,
      legalAccepted: true,
    });
    expect(JSON.stringify(snapshot)).not.toContain("sha256");
  });
});
