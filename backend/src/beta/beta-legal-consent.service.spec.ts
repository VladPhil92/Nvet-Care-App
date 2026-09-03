import { ForbiddenException } from "@nestjs/common";
import { AuditAction, AuditSeverity, UserRole } from "@prisma/client";
import { BetaLegalConsentService } from "./beta-legal-consent.service";
import {
  BETA_LEGAL_PROGRAM,
  BETA_PRIVACY_VERSION,
  BETA_TERMS_VERSION,
} from "./beta-legal.constants";

describe("BetaLegalConsentService", () => {
  const prisma = {
    auditLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  } as any;

  let service: BetaLegalConsentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BetaLegalConsentService(prisma);
    prisma.auditLog.findMany.mockResolvedValue([]);
  });

  it("fails closed when the current beta contract has not been accepted", async () => {
    await expect(service.assertCurrentAcceptance("client-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects stale or partial legal acceptance", async () => {
    await expect(
      service.accept("client-1", UserRole.CLIENT, {
        accepted: true,
        termsVersion: "old-terms",
        privacyVersion: BETA_PRIVACY_VERSION,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("persists exact current versions in the append-only audit log", async () => {
    const createdAt = new Date("2026-09-03T12:00:00.000Z");
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1", createdAt });

    const result = await service.accept("client-1", UserRole.CLIENT, {
      accepted: true,
      termsVersion: BETA_TERMS_VERSION,
      privacyVersion: BETA_PRIVACY_VERSION,
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "client-1",
        actorRole: UserRole.CLIENT,
        action: AuditAction.CONFIG_CHANGED,
        severity: AuditSeverity.INFO,
        targetType: "BetaLegalAcceptance",
        targetId: "client-1",
        reason: "beta_legal_acceptance",
        metadata: {
          program: BETA_LEGAL_PROGRAM,
          termsVersion: BETA_TERMS_VERSION,
          privacyVersion: BETA_PRIVACY_VERSION,
        },
      }),
    });
    expect(result.accepted).toBe(true);
    expect(result.acceptedAt).toBe(createdAt.toISOString());
  });

  it("recognizes only an acceptance matching every current version", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: "old",
        createdAt: new Date("2026-09-02T00:00:00.000Z"),
        metadata: {
          program: BETA_LEGAL_PROGRAM,
          termsVersion: "old-terms",
          privacyVersion: BETA_PRIVACY_VERSION,
        },
      },
      {
        id: "current",
        createdAt: new Date("2026-09-03T00:00:00.000Z"),
        metadata: {
          program: BETA_LEGAL_PROGRAM,
          termsVersion: BETA_TERMS_VERSION,
          privacyVersion: BETA_PRIVACY_VERSION,
        },
      },
    ]);

    await expect(service.assertCurrentAcceptance("client-1")).resolves.toBeUndefined();
    const status = await service.getStatus("client-1");
    expect(status.accepted).toBe(true);
    expect(status.acceptedAt).toBe("2026-09-03T00:00:00.000Z");
  });
});
