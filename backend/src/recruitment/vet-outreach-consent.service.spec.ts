import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AuditAction, UserRole } from "@prisma/client";
import {
  VetOutreachChannel,
  VetOutreachConsentSource,
} from "./dto/vet-outreach-consent.dto";
import { VetOutreachConsentService } from "./vet-outreach-consent.service";

describe("VetOutreachConsentService", () => {
  const rows: Array<{
    targetType: string;
    targetId: string;
    createdAt: Date;
    metadata: unknown;
  }> = [];
  let sequence = 0;

  const prisma = {
    auditLog: {
      create: jest.fn(async ({ data }) => {
        sequence += 1;
        rows.push({
          targetType: data.targetType,
          targetId: data.targetId,
          createdAt: new Date(
            `2026-09-10T05:${String(sequence).padStart(2, "0")}:00Z`,
          ),
          metadata: data.metadata,
        });
        return data;
      }),
      findMany: jest.fn(async ({ where }) =>
        rows.filter(
          (row) =>
            row.targetType === where.targetType &&
            (!where.targetId || row.targetId === where.targetId),
        ),
      ),
    },
  } as any;

  const actor = {
    id: "admin-id",
    role: UserRole.ADMIN,
  };

  const grantDto = {
    channel: VetOutreachChannel.EMAIL,
    source: VetOutreachConsentSource.DIRECT_OPT_IN,
    evidenceReference: "crm://consents/cartagena/ana-001",
    authorizationStatementVersion: "vet-recruitment-v1",
    note: "Captured during direct onboarding call",
  };

  let service: VetOutreachConsentService;
  let originalEnforcement: string | undefined;

  beforeEach(() => {
    rows.length = 0;
    sequence = 0;
    jest.clearAllMocks();
    originalEnforcement = process.env.NVET_VET_OUTREACH_CONSENT_ENFORCED;
    delete process.env.NVET_VET_OUTREACH_CONSENT_ENFORCED;
    service = new VetOutreachConsentService(prisma);
    rows.push({
      targetType: "VET_RECRUITMENT_LEAD",
      targetId: "lead-1",
      createdAt: new Date("2026-09-10T05:00:00Z"),
      metadata: {
        schemaVersion: 1,
        program: "vet-recruitment-crm-phase-20",
        eventType: "CREATED",
        fullName: "Ana Veterinaria",
        email: "ana@example.com",
        marketDaneCode: "13001",
      },
    });
  });

  afterEach(() => {
    if (originalEnforcement === undefined) {
      delete process.env.NVET_VET_OUTREACH_CONSENT_ENFORCED;
    } else {
      process.env.NVET_VET_OUTREACH_CONSENT_ENFORCED = originalEnforcement;
    }
  });

  it("starts fail-closed as not recorded when enforcement is enabled", async () => {
    process.env.NVET_VET_OUTREACH_CONSENT_ENFORCED = "true";

    const status = await service.getStatus("lead-1");
    expect(status.state).toBe("NOT_RECORDED");
    expect(status.contactAllowed).toBe(false);

    await expect(service.assertEmailDeliveryAllowed("lead-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("records auditable permission and permits the configured channel", async () => {
    process.env.NVET_VET_OUTREACH_CONSENT_ENFORCED = "true";

    const status = await service.grant("lead-1", grantDto, actor);

    expect(status.state).toBe("ACTIVE");
    expect(status.contactAllowed).toBe(true);
    expect(status.channel).toBe(VetOutreachChannel.EMAIL);
    expect(status.evidenceReference).toBe(grantDto.evidenceReference);
    expect(status.authorizationStatementVersion).toBe(
      grantDto.authorizationStatementVersion,
    );
    await expect(service.assertEmailDeliveryAllowed("lead-1")).resolves.toBeUndefined();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.CONFIG_CHANGED,
          targetType: "VET_RECRUITMENT_CONTACT_PERMISSION",
          targetId: "lead-1",
        }),
      }),
    );
  });

  it("revokes permission append-only and blocks later delivery", async () => {
    process.env.NVET_VET_OUTREACH_CONSENT_ENFORCED = "true";
    await service.grant("lead-1", grantDto, actor);

    const revoked = await service.revoke(
      "lead-1",
      "Candidate requested no further recruitment email",
      actor,
    );

    expect(revoked.state).toBe("REVOKED");
    expect(revoked.contactAllowed).toBe(false);
    expect(revoked.revokedAt).not.toBeNull();
    await expect(service.assertEmailDeliveryAllowed("lead-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects duplicate active grants instead of overwriting evidence", async () => {
    await service.grant("lead-1", grantDto, actor);

    await expect(service.grant("lead-1", grantDto, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("detects an invalid append-only permission sequence as conflicted", async () => {
    rows.push(
      {
        targetType: "VET_RECRUITMENT_CONTACT_PERMISSION",
        targetId: "lead-1",
        createdAt: new Date("2026-09-10T05:01:00Z"),
        metadata: {
          schemaVersion: 1,
          program: "vet-outreach-consent-phase-22",
          eventType: "CONSENT_REVOKED",
        },
      },
      {
        targetType: "VET_RECRUITMENT_CONTACT_PERMISSION",
        targetId: "lead-1",
        createdAt: new Date("2026-09-10T05:02:00Z"),
        metadata: {
          schemaVersion: 1,
          program: "vet-outreach-consent-phase-22",
          eventType: "CONSENT_GRANTED",
          channel: VetOutreachChannel.EMAIL,
          source: VetOutreachConsentSource.DIRECT_OPT_IN,
          evidenceReference: "crm://consents/invalid-sequence",
          authorizationStatementVersion: "v1",
        },
      },
    );

    const status = await service.getStatus("lead-1");
    expect(status.state).toBe("CONFLICTED");
    expect(status.contactAllowed).toBe(false);
  });
});
