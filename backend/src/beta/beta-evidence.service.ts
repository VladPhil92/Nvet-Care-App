import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { AuditAction, AuditSeverity, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  BETA_EVIDENCE_GATES,
  BETA_EVIDENCE_PROGRAM,
  BETA_EVIDENCE_TARGET_TYPE,
  BetaEvidenceEventType,
  BetaEvidenceGate,
  BetaEvidenceStatus,
  BetaGateStatus,
} from "./beta-evidence.constants";
import {
  DecideBetaEvidenceDto,
  SubmitBetaEvidenceDto,
} from "./dto/beta-evidence.dto";

const MAX_EVENT_ROWS = 2000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SENSITIVE_REFERENCE_PATTERN =
  /(authorization|bearer\s|api[_-]?key|password|secret|token)\s*[:=]/i;

export interface BetaEvidenceActor {
  id: string;
  role: string;
  ip?: string;
  userAgent?: string;
}

type EvidenceMetadata = {
  schemaVersion: 1;
  program: typeof BETA_EVIDENCE_PROGRAM;
  gate: BetaEvidenceGate;
  eventType: BetaEvidenceEventType;
  environment?: "production" | "staging";
  reference?: string;
  referenceSha256?: string;
  observedAt?: string;
  expiresAt?: string | null;
  note?: string;
  reason?: string;
};

type EvidenceEvent = {
  id: string;
  evidenceId: string;
  actorId: string | null;
  actorRole: string | null;
  createdAt: Date;
  metadata: EvidenceMetadata;
};

export type DerivedBetaEvidence = {
  evidenceId: string;
  gate: BetaEvidenceGate;
  environment: "production" | "staging";
  reference: string;
  referenceSha256: string;
  observedAt: string;
  expiresAt: string | null;
  note: string | null;
  status: BetaEvidenceStatus;
  conflict: boolean;
  conflictReasons: string[];
  submittedAt: string;
  lastEventAt: string;
  eventCount: number;
};

@Injectable()
export class BetaEvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(dto: SubmitBetaEvidenceDto, actor: BetaEvidenceActor) {
    const gate = dto.gate as BetaEvidenceGate;
    const reference = this.normalizeReference(dto.reference);
    const observedAt = this.parseObservedAt(dto.observedAt);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (expiresAt && expiresAt <= observedAt) {
      throw new BadRequestException(
        "Evidence expiry must be after the observation timestamp.",
      );
    }

    const evidenceId = randomUUID();
    const metadata: EvidenceMetadata = {
      schemaVersion: 1,
      program: BETA_EVIDENCE_PROGRAM,
      gate,
      eventType: "SUBMITTED",
      environment: dto.environment,
      reference,
      referenceSha256: createHash("sha256").update(reference).digest("hex"),
      observedAt: observedAt.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
      note: dto.note?.trim() || undefined,
    };

    await this.appendEvent(evidenceId, metadata, actor);
    return this.getEvidence(evidenceId);
  }

  approve(
    evidenceId: string,
    dto: DecideBetaEvidenceDto,
    actor: BetaEvidenceActor,
  ) {
    return this.decide(evidenceId, "APPROVED", dto, actor);
  }

  reject(
    evidenceId: string,
    dto: DecideBetaEvidenceDto,
    actor: BetaEvidenceActor,
  ) {
    return this.decide(evidenceId, "REJECTED", dto, actor);
  }

  revoke(
    evidenceId: string,
    dto: DecideBetaEvidenceDto,
    actor: BetaEvidenceActor,
  ) {
    return this.decide(evidenceId, "REVOKED", dto, actor);
  }

  async getHistory() {
    const events = await this.getEvents();
    const evidenceIds = [...new Set(events.map((event) => event.evidenceId))];
    const evidence = evidenceIds
      .map((id) => this.deriveEvidence(events.filter((event) => event.evidenceId === id)))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

    return {
      program: BETA_EVIDENCE_PROGRAM,
      appendOnly: true,
      evidence,
      total: evidence.length,
      generatedAt: new Date().toISOString(),
    } as const;
  }

  async getPromotionSummary() {
    const history = await this.getHistory();
    const gates = BETA_EVIDENCE_GATES.map((gate) => {
      const items = history.evidence.filter((item) => item.gate === gate);
      const conflictCount = items.filter((item) => item.status === "CONFLICTED").length;
      const expiredCount = items.filter((item) => item.status === "EXPIRED").length;
      const approved = items.filter((item) => item.status === "APPROVED");
      const status: BetaGateStatus =
        conflictCount > 0
          ? "CONFLICTED"
          : approved.length > 0
            ? "VERIFIED"
            : "PENDING";

      return {
        gate,
        status,
        approvedEvidenceCount: approved.length,
        conflictCount,
        expiredCount,
        latestApprovedEvidenceId: approved.at(-1)?.evidenceId ?? null,
      } as const;
    });

    const verifiedGates = gates.filter((gate) => gate.status === "VERIFIED").length;
    const conflictedGates = gates.filter((gate) => gate.status === "CONFLICTED").length;
    const eligibleForOperatorActivation =
      verifiedGates === BETA_EVIDENCE_GATES.length && conflictedGates === 0;

    return {
      program: BETA_EVIDENCE_PROGRAM,
      ledger: "audit_logs",
      appendOnly: true,
      totalGates: BETA_EVIDENCE_GATES.length,
      verifiedGates,
      pendingGates: BETA_EVIDENCE_GATES.length - verifiedGates - conflictedGates,
      conflictedGates,
      eligibleForOperatorActivation,
      commercialLaunchAuthorized: false,
      gates,
      generatedAt: new Date().toISOString(),
    } as const;
  }

  async getEvidence(evidenceId: string) {
    const events = await this.getEvents(evidenceId);
    if (events.length === 0) {
      throw new NotFoundException("Beta evidence record not found.");
    }
    return this.deriveEvidence(events);
  }

  private async decide(
    evidenceId: string,
    eventType: Exclude<BetaEvidenceEventType, "SUBMITTED">,
    dto: DecideBetaEvidenceDto,
    actor: BetaEvidenceActor,
  ) {
    const current = await this.getEvidence(evidenceId);
    if (current.status === "CONFLICTED") {
      throw new ConflictException(
        "Evidence stream is conflicted and requires forensic reconciliation.",
      );
    }
    if (current.status === "EXPIRED") {
      throw new ConflictException(
        "Expired evidence cannot be approved, rejected or revoked. Submit fresh evidence.",
      );
    }

    const allowed =
      (current.status === "PENDING" &&
        (eventType === "APPROVED" || eventType === "REJECTED")) ||
      (current.status === "APPROVED" && eventType === "REVOKED");
    if (!allowed) {
      throw new ConflictException(
        `Invalid beta evidence transition: ${current.status} -> ${eventType}.`,
      );
    }

    const metadata: EvidenceMetadata = {
      schemaVersion: 1,
      program: BETA_EVIDENCE_PROGRAM,
      gate: current.gate,
      eventType,
      reason: dto.reason?.trim() || undefined,
    };
    await this.appendEvent(evidenceId, metadata, actor);
    return this.getEvidence(evidenceId);
  }

  private async appendEvent(
    evidenceId: string,
    metadata: EvidenceMetadata,
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
          metadata.eventType === "REJECTED" || metadata.eventType === "REVOKED"
            ? AuditSeverity.WARN
            : AuditSeverity.INFO,
        targetType: BETA_EVIDENCE_TARGET_TYPE,
        targetId: evidenceId,
        reason: `Beta evidence ${metadata.eventType.toLowerCase()}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getEvents(evidenceId?: string): Promise<EvidenceEvent[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: BETA_EVIDENCE_TARGET_TYPE,
        ...(evidenceId ? { targetId: evidenceId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS,
    });

    return rows
      .map((row) => {
        const metadata = this.parseMetadata(row.metadata);
        if (!metadata) return null;
        return {
          id: row.id,
          evidenceId: row.targetId ?? "",
          actorId: row.actorId,
          actorRole: row.actorRole,
          createdAt: row.createdAt,
          metadata,
        } satisfies EvidenceEvent;
      })
      .filter((event): event is EvidenceEvent => Boolean(event?.evidenceId));
  }

  private deriveEvidence(events: EvidenceEvent[]): DerivedBetaEvidence {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const first = sorted[0];
    const submissions = sorted.filter(
      (event) => event.metadata.eventType === "SUBMITTED",
    );
    const submission = submissions[0];
    const conflictReasons: string[] = [];

    if (!submission) {
      throw new ConflictException("Evidence stream has no submission event.");
    }
    if (submissions.length !== 1) {
      conflictReasons.push("MULTIPLE_SUBMISSION_EVENTS");
    }

    const gate = submission.metadata.gate;
    const environment = submission.metadata.environment;
    const reference = submission.metadata.reference;
    const referenceSha256 = submission.metadata.referenceSha256;
    const observedAt = submission.metadata.observedAt;
    if (!environment || !reference || !referenceSha256 || !observedAt) {
      conflictReasons.push("INCOMPLETE_SUBMISSION_METADATA");
    }

    let state: BetaEvidenceStatus = "PENDING";
    for (const event of sorted) {
      if (event === submission) continue;
      if (event.metadata.gate !== gate) {
        conflictReasons.push("GATE_IDENTITY_CHANGED");
        continue;
      }

      switch (event.metadata.eventType) {
        case "SUBMITTED":
          break;
        case "APPROVED":
          if (state !== "PENDING") {
            conflictReasons.push(`INVALID_TRANSITION_${state}_TO_APPROVED`);
          } else {
            state = "APPROVED";
          }
          break;
        case "REJECTED":
          if (state !== "PENDING") {
            conflictReasons.push(`INVALID_TRANSITION_${state}_TO_REJECTED`);
          } else {
            state = "REJECTED";
          }
          break;
        case "REVOKED":
          if (state !== "APPROVED") {
            conflictReasons.push(`INVALID_TRANSITION_${state}_TO_REVOKED`);
          } else {
            state = "REVOKED";
          }
          break;
      }
    }

    const expiresAt = submission.metadata.expiresAt ?? null;
    if (
      conflictReasons.length === 0 &&
      expiresAt &&
      (state === "PENDING" || state === "APPROVED") &&
      new Date(expiresAt).getTime() <= Date.now()
    ) {
      state = "EXPIRED";
    }
    if (conflictReasons.length > 0) state = "CONFLICTED";

    return {
      evidenceId: first.evidenceId,
      gate,
      environment: environment ?? "production",
      reference: reference ?? "[invalid]",
      referenceSha256: referenceSha256 ?? "",
      observedAt: observedAt ?? submission.createdAt.toISOString(),
      expiresAt,
      note: submission.metadata.note ?? null,
      status: state,
      conflict: conflictReasons.length > 0,
      conflictReasons,
      submittedAt: submission.createdAt.toISOString(),
      lastEventAt: sorted.at(-1)?.createdAt.toISOString() ?? submission.createdAt.toISOString(),
      eventCount: sorted.length,
    };
  }

  private parseMetadata(value: Prisma.JsonValue | null): EvidenceMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.program !== BETA_EVIDENCE_PROGRAM) {
      return null;
    }
    if (!BETA_EVIDENCE_GATES.includes(raw.gate as BetaEvidenceGate)) return null;
    if (!["SUBMITTED", "APPROVED", "REJECTED", "REVOKED"].includes(String(raw.eventType))) {
      return null;
    }
    return raw as unknown as EvidenceMetadata;
  }

  private parseObservedAt(value: string): Date {
    const observedAt = new Date(value);
    if (!Number.isFinite(observedAt.getTime())) {
      throw new BadRequestException("Invalid evidence observation timestamp.");
    }
    if (observedAt.getTime() > Date.now() + FUTURE_CLOCK_SKEW_MS) {
      throw new BadRequestException("Evidence observation timestamp is in the future.");
    }
    return observedAt;
  }

  private normalizeReference(value: string): string {
    const reference = value.trim();
    if (/\r|\n/.test(reference)) {
      throw new BadRequestException("Evidence reference must be a single line.");
    }
    if (SENSITIVE_REFERENCE_PATTERN.test(reference)) {
      throw new BadRequestException(
        "Evidence reference appears to contain a credential or secret.",
      );
    }
    return reference;
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
