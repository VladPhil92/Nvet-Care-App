import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AuditAction, AuditSeverity, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BETA_EVIDENCE_PROGRAM } from "./beta-evidence.constants";
import { BetaEvidenceActor } from "./beta-evidence.service";
import {
  ConfigureBetaSupportDto,
  RevokeBetaSupportDto,
} from "./dto/beta-support.dto";

const BETA_SUPPORT_TARGET_TYPE = "BETA_SUPPORT_CONFIGURATION";
const DEFAULT_LEASE_HOURS = 24;
const MAX_EVENT_ROWS = 1000;
const CRITICAL_INCIDENT_TARGET_MINUTES = 30;
const SENSITIVE_CHANNEL_PATTERN =
  /(?:api[-_ ]?key|token|secret|password|authorization|bearer)\s*[:=]/i;

type BetaSupportEventType = "CONFIGURED" | "REVOKED";
type BetaSupportState =
  | "MISSING"
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "CONFLICTED";

type BetaSupportMetadata = {
  schemaVersion: 1;
  program: typeof BETA_EVIDENCE_PROGRAM;
  eventType: BetaSupportEventType;
  ownerRole?: string;
  channelReference?: string;
  monitoringConfirmed?: boolean;
  expiresAt?: string;
  reason?: string;
};

type BetaSupportEvent = {
  configurationId: string;
  createdAt: Date;
  metadata: BetaSupportMetadata;
};

type DerivedSupportConfiguration = {
  configurationId: string;
  state: Exclude<BetaSupportState, "MISSING" | "CONFLICTED">;
  configuredAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  ownerRole: string | null;
  channelReference: string | null;
  monitoringConfirmed: boolean;
  eventCount: number;
  lastEventAt: string;
  conflictReasons: string[];
};

@Injectable()
export class BetaSupportService {
  constructor(private readonly prisma: PrismaService) {}

  async configure(dto: ConfigureBetaSupportDto, actor: BetaEvidenceActor) {
    const current = await this.getStatus();
    if (current.state === "ACTIVE") {
      throw new ConflictException(
        "An active beta support configuration already exists.",
      );
    }
    if (current.state === "CONFLICTED") {
      throw new ConflictException(
        "Beta support configuration history is conflicted and requires reconciliation.",
      );
    }

    const ownerRole = dto.ownerRole.trim();
    const channelReference = dto.channelReference.trim();
    this.assertSafeChannelReference(channelReference);

    const configurationId = randomUUID();
    const durationHours = dto.durationHours ?? DEFAULT_LEASE_HOURS;
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    await this.appendEvent(
      configurationId,
      {
        schemaVersion: 1,
        program: BETA_EVIDENCE_PROGRAM,
        eventType: "CONFIGURED",
        ownerRole,
        channelReference,
        monitoringConfirmed: dto.monitoringConfirmed === true,
        expiresAt: expiresAt.toISOString(),
        reason: dto.reason?.trim() || undefined,
      },
      actor,
    );

    return this.getAdminSnapshot();
  }

  async revoke(dto: RevokeBetaSupportDto, actor: BetaEvidenceActor) {
    const current = await this.getStatus();
    if (current.state !== "ACTIVE" || !current.configurationId) {
      throw new ConflictException(
        "There is no active beta support configuration to revoke.",
      );
    }

    await this.appendEvent(
      current.configurationId,
      {
        schemaVersion: 1,
        program: BETA_EVIDENCE_PROGRAM,
        eventType: "REVOKED",
        reason: dto.reason.trim(),
      },
      actor,
    );

    return this.getAdminSnapshot();
  }

  async getOperationalSnapshot() {
    const status = await this.getStatus();
    const configured =
      status.state === "ACTIVE" &&
      status.ownerConfigured &&
      status.channelConfigured &&
      status.monitoringConfirmed;

    return {
      state: status.state,
      configured,
      ownerConfigured: status.ownerConfigured,
      channelConfigured: status.channelConfigured,
      monitoringConfirmed: status.monitoringConfirmed,
      expiresAt: status.expiresAt,
      criticalIncidentTargetMinutes: CRITICAL_INCIDENT_TARGET_MINUTES,
      ledger: "audit_logs",
      appendOnly: true,
      configurationSource: "admin-control-plane",
    } as const;
  }

  async getAdminSnapshot() {
    const status = await this.getStatus();
    return {
      ...status,
      criticalIncidentTargetMinutes: CRITICAL_INCIDENT_TARGET_MINUTES,
      ledger: "audit_logs",
      appendOnly: true,
      supportReferenceAdminOnly: true,
      commercialLaunchAuthorized: false,
    } as const;
  }

  async assertReadyForBeta(): Promise<void> {
    const snapshot = await this.getOperationalSnapshot();
    if (!snapshot.configured) {
      throw new ServiceUnavailableException({
        error: "BETA_SUPPORT_NOT_READY",
        state: snapshot.state,
        message:
          "La operación de soporte de la beta no tiene una configuración vigente y monitoreada.",
      });
    }
  }

  async getStatus() {
    const events = await this.getEvents();
    if (events.length === 0) {
      return {
        state: "MISSING" as BetaSupportState,
        configurationId: null,
        configuredAt: null,
        expiresAt: null,
        revokedAt: null,
        ownerRole: null,
        channelReference: null,
        ownerConfigured: false,
        channelConfigured: false,
        monitoringConfirmed: false,
        conflictReasons: [] as string[],
        appendOnly: true,
      };
    }

    const grouped = new Map<string, BetaSupportEvent[]>();
    for (const event of events) {
      const stream = grouped.get(event.configurationId) ?? [];
      stream.push(event);
      grouped.set(event.configurationId, stream);
    }

    const derived = [...grouped.values()].map((stream) =>
      this.deriveConfiguration(stream),
    );
    const conflicted = derived.filter(
      (item) => item.conflictReasons.length > 0,
    );
    const active = derived.filter((item) => item.state === "ACTIVE");

    if (conflicted.length > 0 || active.length > 1) {
      const conflictReasons = [
        ...conflicted.flatMap((item) => item.conflictReasons),
        ...(active.length > 1
          ? ["MULTIPLE_ACTIVE_SUPPORT_CONFIGURATIONS"]
          : []),
      ];
      return {
        state: "CONFLICTED" as BetaSupportState,
        configurationId: active[0]?.configurationId ?? null,
        configuredAt: active[0]?.configuredAt ?? null,
        expiresAt: active[0]?.expiresAt ?? null,
        revokedAt: active[0]?.revokedAt ?? null,
        ownerRole: active[0]?.ownerRole ?? null,
        channelReference: active[0]?.channelReference ?? null,
        ownerConfigured: Boolean(active[0]?.ownerRole),
        channelConfigured: Boolean(active[0]?.channelReference),
        monitoringConfirmed: Boolean(active[0]?.monitoringConfirmed),
        conflictReasons: [...new Set(conflictReasons)],
        appendOnly: true,
      };
    }

    const selected =
      active[0] ??
      [...derived].sort(
        (a, b) => Date.parse(b.lastEventAt) - Date.parse(a.lastEventAt),
      )[0];

    return {
      state: selected.state as BetaSupportState,
      configurationId: selected.configurationId,
      configuredAt: selected.configuredAt,
      expiresAt: selected.expiresAt,
      revokedAt: selected.revokedAt,
      ownerRole: selected.ownerRole,
      channelReference: selected.channelReference,
      ownerConfigured: Boolean(selected.ownerRole),
      channelConfigured: Boolean(selected.channelReference),
      monitoringConfirmed: selected.monitoringConfirmed,
      conflictReasons: selected.conflictReasons,
      appendOnly: true,
    };
  }

  private deriveConfiguration(
    events: BetaSupportEvent[],
  ): DerivedSupportConfiguration {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const configurationId = sorted[0].configurationId;
    const conflictReasons: string[] = [];
    let configuredAt: string | null = null;
    let expiresAt: string | null = null;
    let revokedAt: string | null = null;
    let ownerRole: string | null = null;
    let channelReference: string | null = null;
    let monitoringConfirmed = false;
    let configuredSeen = false;

    for (const event of sorted) {
      if (event.metadata.eventType === "CONFIGURED") {
        if (configuredSeen) {
          conflictReasons.push("DUPLICATE_CONFIGURATION_EVENT");
          continue;
        }
        configuredSeen = true;
        configuredAt = event.createdAt.toISOString();
        expiresAt = event.metadata.expiresAt ?? null;
        ownerRole = event.metadata.ownerRole?.trim() || null;
        channelReference = event.metadata.channelReference?.trim() || null;
        monitoringConfirmed = event.metadata.monitoringConfirmed === true;
      } else {
        if (!configuredSeen) {
          conflictReasons.push("REVOKE_WITHOUT_CONFIGURATION");
        }
        if (revokedAt) {
          conflictReasons.push("DUPLICATE_REVOCATION_EVENT");
        }
        revokedAt = event.createdAt.toISOString();
      }
    }

    if (!configuredAt) {
      conflictReasons.push("CONFIGURATION_EVENT_MISSING");
      configuredAt = sorted[0].createdAt.toISOString();
    }
    if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
      conflictReasons.push("CONFIGURATION_EXPIRY_INVALID");
    }
    if (!ownerRole) {
      conflictReasons.push("SUPPORT_OWNER_MISSING");
    }
    if (!channelReference) {
      conflictReasons.push("SUPPORT_CHANNEL_MISSING");
    }
    if (!monitoringConfirmed) {
      conflictReasons.push("SUPPORT_MONITORING_NOT_CONFIRMED");
    }

    let state: DerivedSupportConfiguration["state"] = "ACTIVE";
    if (revokedAt) {
      state = "REVOKED";
    } else if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      state = "EXPIRED";
    }

    return {
      configurationId,
      state,
      configuredAt,
      expiresAt,
      revokedAt,
      ownerRole,
      channelReference,
      monitoringConfirmed,
      eventCount: sorted.length,
      lastEventAt:
        sorted.at(-1)?.createdAt.toISOString() ??
        sorted[0].createdAt.toISOString(),
      conflictReasons,
    };
  }

  private async appendEvent(
    configurationId: string,
    metadata: BetaSupportMetadata,
    actor: BetaEvidenceActor,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: this.normalizeIp(actor.ip),
        actorUserAgent: this.truncate(actor.userAgent, 500),
        action: AuditAction.CONFIG_CHANGED,
        severity:
          metadata.eventType === "REVOKED"
            ? AuditSeverity.WARN
            : AuditSeverity.INFO,
        targetType: BETA_SUPPORT_TARGET_TYPE,
        targetId: configurationId,
        reason: `Beta support ${metadata.eventType.toLowerCase()}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getEvents(): Promise<BetaSupportEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: BETA_SUPPORT_TARGET_TYPE,
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS + 1,
      select: {
        targetId: true,
        createdAt: true,
        metadata: true,
      },
    });

    if (rows.length > MAX_EVENT_ROWS) {
      throw new ServiceUnavailableException(
        "Beta support ledger exceeded the safe operational read boundary.",
      );
    }

    return rows
      .map((row) => {
        if (!row.targetId) return null;
        const metadata = this.parseMetadata(row.metadata);
        if (!metadata) return null;
        return {
          configurationId: row.targetId,
          createdAt: row.createdAt,
          metadata,
        } satisfies BetaSupportEvent;
      })
      .filter((event): event is BetaSupportEvent => Boolean(event));
  }

  private parseMetadata(
    value: Prisma.JsonValue | null,
  ): BetaSupportMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.program !== BETA_EVIDENCE_PROGRAM) {
      return null;
    }
    if (!["CONFIGURED", "REVOKED"].includes(String(raw.eventType))) {
      return null;
    }
    return raw as unknown as BetaSupportMetadata;
  }

  private assertSafeChannelReference(value: string) {
    if (SENSITIVE_CHANNEL_PATTERN.test(value)) {
      throw new BadRequestException(
        "Support channel reference must not contain credentials, tokens or secrets.",
      );
    }
  }

  private normalizeIp(ip?: string): string | undefined {
    if (!ip) return undefined;
    return ip.split(",")[0].trim().slice(0, 45);
  }

  private truncate(value?: string, max = 500): string | undefined {
    if (!value) return undefined;
    return value.trim().slice(0, max);
  }
}
