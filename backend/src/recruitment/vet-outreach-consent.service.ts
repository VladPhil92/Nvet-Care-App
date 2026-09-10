import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AuditAction, AuditSeverity, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  GrantVetOutreachConsentDto,
  VetOutreachChannel,
  VetOutreachConsentSource,
} from "./dto/vet-outreach-consent.dto";

const PROGRAM = "vet-outreach-consent-phase-22";
const TARGET_TYPE = "VET_RECRUITMENT_CONTACT_PERMISSION";
const LEAD_PROGRAM = "vet-recruitment-crm-phase-20";
const LEAD_TARGET_TYPE = "VET_RECRUITMENT_LEAD";
const MAX_EVENT_ROWS = 5000;

type ConsentEventType = "CONSENT_GRANTED" | "CONSENT_REVOKED";
type ConsentState = "NOT_RECORDED" | "ACTIVE" | "REVOKED" | "CONFLICTED";

type ConsentMetadata = {
  schemaVersion: 1;
  program: typeof PROGRAM;
  eventType: ConsentEventType;
  channel?: VetOutreachChannel;
  source?: VetOutreachConsentSource;
  evidenceReference?: string;
  authorizationStatementVersion?: string;
  note?: string;
  reason?: string;
};

type ConsentEvent = {
  leadId: string;
  createdAt: Date;
  metadata: ConsentMetadata;
};

export type VetOutreachActor = {
  id: string;
  role: UserRole;
  ip?: string;
  userAgent?: string;
};

export type VetOutreachConsentStatus = {
  phase: 22;
  leadId: string;
  state: ConsentState;
  contactAllowed: boolean;
  channel: VetOutreachChannel | null;
  source: VetOutreachConsentSource | null;
  evidenceReference: string | null;
  authorizationStatementVersion: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
  conflicted: boolean;
};

@Injectable()
export class VetOutreachConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async grant(
    leadId: string,
    dto: GrantVetOutreachConsentDto,
    actor: VetOutreachActor,
  ): Promise<VetOutreachConsentStatus> {
    await this.assertRecruitmentLeadExists(leadId);
    const current = await this.getStatus(leadId);
    if (current.conflicted) {
      throw new ConflictException({
        error: "VET_OUTREACH_PERMISSION_HISTORY_CONFLICT",
      });
    }
    if (current.contactAllowed) {
      throw new ConflictException({
        error: "VET_OUTREACH_PERMISSION_ALREADY_ACTIVE",
        channel: current.channel,
      });
    }

    await this.appendEvent(
      leadId,
      {
        schemaVersion: 1,
        program: PROGRAM,
        eventType: "CONSENT_GRANTED",
        channel: dto.channel,
        source: dto.source,
        evidenceReference: dto.evidenceReference.trim(),
        authorizationStatementVersion:
          dto.authorizationStatementVersion.trim(),
        note: dto.note?.trim() || undefined,
      },
      actor,
    );

    return this.getStatus(leadId);
  }

  async revoke(
    leadId: string,
    reason: string | undefined,
    actor: VetOutreachActor,
  ): Promise<VetOutreachConsentStatus> {
    await this.assertRecruitmentLeadExists(leadId);
    const current = await this.getStatus(leadId);
    if (current.conflicted) {
      throw new ConflictException({
        error: "VET_OUTREACH_PERMISSION_HISTORY_CONFLICT",
      });
    }
    if (!current.contactAllowed) {
      throw new ConflictException({
        error: "VET_OUTREACH_PERMISSION_NOT_ACTIVE",
      });
    }

    await this.appendEvent(
      leadId,
      {
        schemaVersion: 1,
        program: PROGRAM,
        eventType: "CONSENT_REVOKED",
        reason: reason?.trim() || undefined,
      },
      actor,
    );

    return this.getStatus(leadId);
  }

  async getStatus(leadId: string): Promise<VetOutreachConsentStatus> {
    await this.assertRecruitmentLeadExists(leadId);
    const events = await this.getEvents(leadId);
    return this.deriveStatus(leadId, events);
  }

  async getAdminSummary() {
    const events = await this.getEvents();
    const grouped = new Map<string, ConsentEvent[]>();
    for (const event of events) {
      const stream = grouped.get(event.leadId) ?? [];
      stream.push(event);
      grouped.set(event.leadId, stream);
    }
    const permissions = [...grouped.entries()]
      .map(([leadId, stream]) => this.deriveStatus(leadId, stream))
      .sort((a, b) => a.leadId.localeCompare(b.leadId));

    return {
      phase: 22,
      program: PROGRAM,
      ledger: "audit_logs",
      appendOnly: true,
      evidenceStorage: "reference-only",
      supportedChannels: [VetOutreachChannel.EMAIL],
      productionInvitationConsentGate: true,
      totals: {
        recorded: permissions.length,
        active: permissions.filter((item) => item.state === "ACTIVE").length,
        revoked: permissions.filter((item) => item.state === "REVOKED").length,
        conflicted: permissions.filter((item) => item.state === "CONFLICTED")
          .length,
      },
      permissions,
      generatedAt: new Date().toISOString(),
    } as const;
  }

  async assertEmailDeliveryAllowed(leadId: string): Promise<void> {
    if (!this.isEnforcementEnabled()) return;
    const status = await this.getStatus(leadId);
    if (
      !status.contactAllowed ||
      status.channel !== VetOutreachChannel.EMAIL ||
      status.conflicted
    ) {
      throw new ForbiddenException({
        error: "VET_OUTREACH_PERMISSION_REQUIRED",
        message:
          "A current, auditable email contact permission is required before sending a veterinarian recruitment invitation.",
        state: status.state,
      });
    }
  }

  private isEnforcementEnabled(): boolean {
    return (
      process.env.NODE_ENV === "production" ||
      process.env.NVET_VET_OUTREACH_CONSENT_ENFORCED === "true"
    );
  }

  private async assertRecruitmentLeadExists(leadId: string): Promise<void> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: LEAD_TARGET_TYPE,
        targetId: leadId,
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS + 1,
      select: { metadata: true },
    });
    if (rows.length > MAX_EVENT_ROWS) {
      throw new ServiceUnavailableException(
        "Recruitment lead history exceeded the safe read boundary.",
      );
    }

    const created = rows.filter((row) => {
      const value = row.metadata;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      const raw = value as Prisma.JsonObject;
      return (
        raw.schemaVersion === 1 &&
        raw.program === LEAD_PROGRAM &&
        raw.eventType === "CREATED"
      );
    });

    if (created.length === 0) {
      throw new NotFoundException("Veterinarian recruitment lead not found.");
    }
    if (created.length !== 1) {
      throw new ConflictException({
        error: "VET_RECRUITMENT_LEAD_HISTORY_CONFLICT",
      });
    }
  }

  private deriveStatus(
    leadId: string,
    events: ConsentEvent[],
  ): VetOutreachConsentStatus {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    let state: ConsentState = "NOT_RECORDED";
    let conflicted = false;
    let latestGrant: ConsentEvent | null = null;
    let latestRevocation: ConsentEvent | null = null;

    for (const event of sorted) {
      if (event.metadata.eventType === "CONSENT_GRANTED") {
        if (
          state === "ACTIVE" ||
          !event.metadata.channel ||
          !event.metadata.source ||
          !event.metadata.evidenceReference ||
          !event.metadata.authorizationStatementVersion
        ) {
          conflicted = true;
        }
        state = "ACTIVE";
        latestGrant = event;
      } else {
        if (state !== "ACTIVE") conflicted = true;
        state = "REVOKED";
        latestRevocation = event;
      }
    }

    if (conflicted) state = "CONFLICTED";
    const metadata = latestGrant?.metadata;
    return {
      phase: 22,
      leadId,
      state,
      contactAllowed: state === "ACTIVE" && !conflicted,
      channel: metadata?.channel ?? null,
      source: metadata?.source ?? null,
      evidenceReference: metadata?.evidenceReference ?? null,
      authorizationStatementVersion:
        metadata?.authorizationStatementVersion ?? null,
      grantedAt: latestGrant?.createdAt.toISOString() ?? null,
      revokedAt: latestRevocation?.createdAt.toISOString() ?? null,
      conflicted,
    };
  }

  private async getEvents(leadId?: string): Promise<ConsentEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: TARGET_TYPE,
        ...(leadId ? { targetId: leadId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS + 1,
      select: { targetId: true, createdAt: true, metadata: true },
    });
    if (rows.length > MAX_EVENT_ROWS) {
      throw new ServiceUnavailableException(
        "Veterinarian outreach permission ledger exceeded the safe read boundary.",
      );
    }

    return rows
      .map((row) => {
        if (!row.targetId) return null;
        const metadata = this.parseMetadata(row.metadata);
        if (!metadata) return null;
        return {
          leadId: row.targetId,
          createdAt: row.createdAt,
          metadata,
        } satisfies ConsentEvent;
      })
      .filter((event): event is ConsentEvent => Boolean(event));
  }

  private parseMetadata(value: Prisma.JsonValue | null): ConsentMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.program !== PROGRAM) return null;
    if (!["CONSENT_GRANTED", "CONSENT_REVOKED"].includes(String(raw.eventType))) {
      return null;
    }
    return raw as unknown as ConsentMetadata;
  }

  private async appendEvent(
    leadId: string,
    metadata: ConsentMetadata,
    actor: VetOutreachActor,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: this.normalizeIp(actor.ip),
        actorUserAgent: this.truncate(actor.userAgent, 500),
        action: AuditAction.CONFIG_CHANGED,
        severity:
          metadata.eventType === "CONSENT_REVOKED"
            ? AuditSeverity.WARN
            : AuditSeverity.INFO,
        targetType: TARGET_TYPE,
        targetId: leadId,
        reason: `Vet outreach permission ${metadata.eventType.toLowerCase()}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private normalizeIp(ip?: string): string | undefined {
    if (!ip) return undefined;
    return ip.split(",")[0].trim().slice(0, 45);
  }

  private truncate(value?: string, max = 500): string | undefined {
    if (!value) return undefined;
    return value.length > max ? value.slice(0, max) : value;
  }
}
