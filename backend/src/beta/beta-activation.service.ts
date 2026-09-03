import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AuditAction,
  AuditSeverity,
  Prisma,
  VerificationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BETA_EVIDENCE_PROGRAM } from "./beta-evidence.constants";
import {
  BetaEvidenceActor,
  BetaEvidenceService,
} from "./beta-evidence.service";
import {
  AuthorizeBetaActivationDto,
  RevokeBetaActivationDto,
} from "./dto/beta-activation.dto";

const BETA_ACTIVATION_TARGET_TYPE = "BETA_ACTIVATION_AUTHORIZATION";
const MAX_EVENT_ROWS = 500;
const DEFAULT_LEASE_HOURS = 24;
const MAX_INITIAL_CLIENTS = 50;
const MIN_VERIFIED_VETS = 3;
const SHA256_HEX = /^[a-f0-9]{64}$/;

type ActivationEventType = "AUTHORIZED" | "REVOKED";
type ActivationState =
  | "MISSING"
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "CONFLICTED";

type ActivationMetadata = {
  schemaVersion: 1;
  program: typeof BETA_EVIDENCE_PROGRAM;
  eventType: ActivationEventType;
  expiresAt?: string;
  reason?: string;
};

type ActivationEvent = {
  authorizationId: string;
  createdAt: Date;
  actorId: string | null;
  metadata: ActivationMetadata;
};

export type BetaActivationPrerequisites = {
  eligible: boolean;
  blockers: string[];
  evidenceEligible: boolean;
  verifiedActiveVets: number;
  minimumVerifiedVets: number;
  configuredClients: number;
  maxInitialClients: number;
  supportConfigured: boolean;
  marketConfigured: boolean;
};

@Injectable()
export class BetaActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: BetaEvidenceService,
  ) {}

  async authorize(
    dto: AuthorizeBetaActivationDto,
    actor: BetaEvidenceActor,
  ) {
    const current = await this.getStatus();
    if (current.state === "ACTIVE") {
      throw new ConflictException("A beta activation authorization is already active.");
    }
    if (current.state === "CONFLICTED") {
      throw new ConflictException(
        "Activation authorization ledger is conflicted and requires reconciliation.",
      );
    }

    const prerequisites = await this.getPrerequisites();
    if (!prerequisites.eligible) {
      throw new ConflictException({
        error: "BETA_ACTIVATION_PREREQUISITES_NOT_SATISFIED",
        blockers: prerequisites.blockers,
      });
    }

    const durationHours = dto.durationHours ?? DEFAULT_LEASE_HOURS;
    const authorizationId = randomUUID();
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    await this.appendEvent(
      authorizationId,
      {
        schemaVersion: 1,
        program: BETA_EVIDENCE_PROGRAM,
        eventType: "AUTHORIZED",
        expiresAt: expiresAt.toISOString(),
        reason: dto.reason?.trim() || undefined,
      },
      actor,
    );

    return this.getStatus();
  }

  async revoke(dto: RevokeBetaActivationDto, actor: BetaEvidenceActor) {
    const current = await this.getStatus();
    if (current.state !== "ACTIVE" || !current.authorizationId) {
      throw new ConflictException("There is no active beta authorization to revoke.");
    }

    await this.appendEvent(
      current.authorizationId,
      {
        schemaVersion: 1,
        program: BETA_EVIDENCE_PROGRAM,
        eventType: "REVOKED",
        reason: dto.reason.trim(),
      },
      actor,
    );

    return this.getStatus();
  }

  async assertActiveForBooking(): Promise<void> {
    const [status, prerequisites] = await Promise.all([
      this.getStatus(),
      this.getPrerequisites(),
    ]);

    if (status.state !== "ACTIVE") {
      throw new ServiceUnavailableException({
        error: "CLOSED_BETA_ACTIVATION_NOT_AUTHORIZED",
        message:
          "La beta cerrada no tiene una autorización operacional vigente para aceptar nuevas reservas.",
      });
    }

    if (!prerequisites.eligible) {
      throw new ServiceUnavailableException({
        error: "CLOSED_BETA_ACTIVATION_DRIFT_DETECTED",
        message:
          "La beta cerrada perdió una condición obligatoria de activación y nuevas reservas fueron bloqueadas.",
      });
    }
  }

  async getPrerequisites(): Promise<BetaActivationPrerequisites> {
    const [promotion, verifiedActiveVets] = await Promise.all([
      this.evidence.getPromotionSummary(),
      this.prisma.vetProfile.count({
        where: {
          isVerified: true,
          isActive: true,
          verificationStatus: VerificationStatus.APPROVED,
          city: {
            contains: "cartagena",
            mode: "insensitive",
          },
        },
      }),
    ]);

    const configuredClients = this.getConfiguredClientCount();
    const supportConfigured = Boolean(
      process.env.NVET_BETA_SUPPORT_OWNER?.trim() &&
        process.env.NVET_BETA_SUPPORT_CHANNEL?.trim(),
    );
    const marketConfigured = this.isCartagenaMarket(
      process.env.NVET_CLOSED_BETA_MARKET,
    );
    const blockers: string[] = [];

    if (!promotion.eligibleForOperatorActivation) {
      blockers.push("PRODUCTION_EVIDENCE_GATES_INCOMPLETE");
    }
    if (verifiedActiveVets < MIN_VERIFIED_VETS) {
      blockers.push("CARTAGENA_VET_COVERAGE_INSUFFICIENT");
    }
    if (configuredClients === 0) {
      blockers.push("CLIENT_COHORT_NOT_CONFIGURED");
    }
    if (configuredClients > MAX_INITIAL_CLIENTS) {
      blockers.push("CLIENT_COHORT_LIMIT_EXCEEDED");
    }
    if (!supportConfigured) {
      blockers.push("SUPPORT_NOT_CONFIGURED");
    }
    if (!marketConfigured) {
      blockers.push("BETA_MARKET_MISMATCH");
    }

    return {
      eligible: blockers.length === 0,
      blockers,
      evidenceEligible: promotion.eligibleForOperatorActivation,
      verifiedActiveVets,
      minimumVerifiedVets: MIN_VERIFIED_VETS,
      configuredClients,
      maxInitialClients: MAX_INITIAL_CLIENTS,
      supportConfigured,
      marketConfigured,
    };
  }

  async getStatus() {
    const events = await this.getEvents();
    if (events.length === 0) {
      return {
        state: "MISSING" as ActivationState,
        authorizationId: null,
        authorizedAt: null,
        expiresAt: null,
        revokedAt: null,
        conflictReasons: [] as string[],
        appendOnly: true,
      };
    }

    const grouped = new Map<string, ActivationEvent[]>();
    for (const event of events) {
      const stream = grouped.get(event.authorizationId) ?? [];
      stream.push(event);
      grouped.set(event.authorizationId, stream);
    }

    const streams = [...grouped.values()]
      .map((stream) => this.deriveStream(stream))
      .sort((a, b) => b.authorizedAt.localeCompare(a.authorizedAt));
    const current = streams[0];

    return {
      ...current,
      appendOnly: true,
      historicalAuthorizations: streams.length,
    };
  }

  private deriveStream(events: ActivationEvent[]) {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const authorizations = sorted.filter(
      (event) => event.metadata.eventType === "AUTHORIZED",
    );
    const revocations = sorted.filter(
      (event) => event.metadata.eventType === "REVOKED",
    );
    const conflictReasons: string[] = [];

    if (authorizations.length !== 1) {
      conflictReasons.push("INVALID_AUTHORIZATION_EVENT_COUNT");
    }
    if (revocations.length > 1) {
      conflictReasons.push("MULTIPLE_REVOCATION_EVENTS");
    }

    const authorization = authorizations[0] ?? sorted[0];
    const expiresAt = authorization.metadata.expiresAt ?? null;
    if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
      conflictReasons.push("INVALID_AUTHORIZATION_EXPIRY");
    }

    let state: ActivationState = "ACTIVE";
    if (revocations.length === 1) state = "REVOKED";
    if (
      state === "ACTIVE" &&
      expiresAt &&
      Number.isFinite(Date.parse(expiresAt)) &&
      Date.parse(expiresAt) <= Date.now()
    ) {
      state = "EXPIRED";
    }
    if (conflictReasons.length > 0) state = "CONFLICTED";

    return {
      state,
      authorizationId: authorization.authorizationId,
      authorizedAt: authorization.createdAt.toISOString(),
      expiresAt,
      revokedAt: revocations[0]?.createdAt.toISOString() ?? null,
      conflictReasons,
    };
  }

  private async appendEvent(
    authorizationId: string,
    metadata: ActivationMetadata,
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
        targetType: BETA_ACTIVATION_TARGET_TYPE,
        targetId: authorizationId,
        reason: `Beta activation ${metadata.eventType.toLowerCase()}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getEvents(): Promise<ActivationEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: BETA_ACTIVATION_TARGET_TYPE,
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS,
    });

    return rows
      .map((row) => {
        const metadata = this.parseMetadata(row.metadata);
        if (!metadata || !row.targetId) return null;
        return {
          authorizationId: row.targetId,
          createdAt: row.createdAt,
          actorId: row.actorId,
          metadata,
        } satisfies ActivationEvent;
      })
      .filter((event): event is ActivationEvent => Boolean(event));
  }

  private parseMetadata(
    value: Prisma.JsonValue | null,
  ): ActivationMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.program !== BETA_EVIDENCE_PROGRAM) {
      return null;
    }
    if (!["AUTHORIZED", "REVOKED"].includes(String(raw.eventType))) {
      return null;
    }
    return raw as unknown as ActivationMetadata;
  }

  private getConfiguredClientCount(): number {
    const raw = process.env.NVET_CLOSED_BETA_CLIENT_HASHES ?? "";
    return new Set(
      raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => SHA256_HEX.test(value)),
    ).size;
  }

  private isCartagenaMarket(value?: string): boolean {
    if (!value?.trim()) return true;
    const normalized = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return normalized.includes("cartagena");
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
