import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditAction, AuditSeverity, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BetaActivationService } from "./beta-activation.service";
import {
  BETA_EVIDENCE_GATES,
  BetaEvidenceGate,
} from "./beta-evidence.constants";
import {
  BetaEvidenceActor,
  BetaEvidenceService,
} from "./beta-evidence.service";
import { BetaSupportService } from "./beta-support.service";
import { CartagenaLaunchReadinessService } from "./cartagena-launch-readiness.service";
import {
  AbortLaunchObservationDto,
  CloseLaunchObservationDto,
  StartLaunchObservationDto,
} from "./dto/launch-observation.dto";

const PROGRAM = "cartagena-launch-operations-phase-25";
const OBSERVATION_TARGET_TYPE = "BETA_CARTAGENA_OBSERVATION";
const OBSERVATION_LEDGER_LOCK_KEY = 1314276692;
const MINIMUM_OBSERVATION_DAYS = 7;
const OBSERVATION_START_BUFFER_HOURS = 1;
const MINIMUM_CONTROL_REMAINING_HOURS =
  MINIMUM_OBSERVATION_DAYS * 24 + OBSERVATION_START_BUFFER_HOURS;
const MAX_EVENT_ROWS = 500;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ObservationEventType = "STARTED" | "CLOSED" | "ABORTED";
type ObservationState =
  | "MISSING"
  | "ACTIVE"
  | "ELIGIBLE_TO_CLOSE"
  | "CLOSED"
  | "ABORTED"
  | "CONFLICTED";
type ExpiryState =
  | "NON_EXPIRING"
  | "HEALTHY"
  | "ATTENTION"
  | "WARNING"
  | "CRITICAL"
  | "EXPIRED";

type ObservationMetadata = {
  schemaVersion: 1;
  program: typeof PROGRAM;
  eventType: ObservationEventType;
  minimumObservationDays?: number;
  authorizationId?: string;
  reason?: string;
  incidentReference?: string;
  baselineDecision?: "GO";
};

type ObservationEvent = {
  observationId: string;
  createdAt: Date;
  metadata: ObservationMetadata;
};

type ObservationLedgerClient = Pick<Prisma.TransactionClient, "auditLog">;

@Injectable()
export class CartagenaLaunchOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly launchReadiness: CartagenaLaunchReadinessService,
    private readonly activation: BetaActivationService,
    private readonly evidence: BetaEvidenceService,
    private readonly support: BetaSupportService,
  ) {}

  async getSnapshot() {
    const [readiness, activation, evidenceHistory, support, observation] =
      await Promise.all([
        this.launchReadiness.getSnapshot(),
        this.activation.getStatus(),
        this.evidence.getHistory(),
        this.support.getOperationalSnapshot(),
        this.getObservationStatus(),
      ]);

    const now = Date.now();
    const expiryItems = this.buildExpiryItems({
      activation,
      evidenceHistory,
      support,
      now,
    });
    const expiryWatch = this.buildExpiryWatch(expiryItems);
    const observationRequired = readiness.runtime.closedBetaEnabled;
    const observationBelongsToCurrentAuthorization =
      activation.state === "ACTIVE" &&
      Boolean(activation.authorizationId) &&
      observation.authorizationId === activation.authorizationId;
    const observationTracked =
      !observationRequired ||
      (observationBelongsToCurrentAuthorization &&
        ["ACTIVE", "ELIGIBLE_TO_CLOSE", "CLOSED"].includes(observation.state));

    const effectiveDecision =
      readiness.decision.state === "PAUSE"
        ? "PAUSE"
        : readiness.decision.state === "HOLD"
          ? "HOLD"
          : observationTracked
            ? "GO"
            : "HOLD";

    const blockers = [...readiness.decision.blockers];
    if (!observationTracked) {
      blockers.push("ACTIVE_BETA_OBSERVATION_NOT_TRACKED");
    }
    if (
      observationRequired &&
      observation.observationId &&
      !observationBelongsToCurrentAuthorization
    ) {
      blockers.push("OBSERVATION_AUTHORIZATION_MISMATCH");
    }
    if (observation.state === "CONFLICTED") {
      blockers.push("OBSERVATION_LEDGER_CONFLICTED");
    }

    const checklist = [
      {
        id: "phase24-readiness",
        label: "Phase 24 launch decision is GO",
        satisfied: readiness.decision.state === "GO",
        blocking: true,
      },
      {
        id: "strict-vet-supply",
        label: "Strict Cartagena VET supply is satisfied",
        satisfied: readiness.supply.strictSupplySatisfied,
        blocking: true,
      },
      {
        id: "production-evidence",
        label: "All production evidence gates are verified",
        satisfied:
          readiness.progress.verifiedEvidenceGates ===
          readiness.progress.totalEvidenceGates,
        blocking: true,
      },
      {
        id: "activation-authorization",
        label: "Beta activation authorization is active",
        satisfied: readiness.runtime.authorizationActive,
        blocking: true,
      },
      {
        id: "market-runtime",
        label: "Cartagena market guard and booking gate are coherent",
        satisfied:
          readiness.runtime.marketGuardEnabled &&
          readiness.runtime.cartagenaBookingGateEligible,
        blocking: true,
      },
      {
        id: "observation-ledger",
        label: "Active beta has a current durable observation record",
        satisfied: observationTracked,
        blocking: observationRequired,
      },
      {
        id: "expiry-watch",
        label: "No control lease expires within 6 hours",
        satisfied: !["CRITICAL", "EXPIRED"].includes(expiryWatch.state),
        blocking: false,
      },
    ] as const;

    return {
      phase: 25,
      program: PROGRAM,
      market: readiness.market,
      decision: {
        phase24: readiness.decision.state,
        effective: effectiveDecision,
        blockers: [...new Set(blockers)],
        operatorAction: this.resolveOperatorAction({
          effectiveDecision,
          baselineDecision: readiness.decision.state,
          closedBetaEnabled: readiness.runtime.closedBetaEnabled,
          observation,
          expiryState: expiryWatch.state,
        }),
        commercialLaunchAuthorized: false,
        automaticallyMutatesRuntime: false,
      },
      observation: {
        ...observation,
        belongsToCurrentAuthorization: observationBelongsToCurrentAuthorization,
        requiredWhenClosedBetaEnabled: true,
        minimumObservationDays: MINIMUM_OBSERVATION_DAYS,
        minimumControlRemainingHoursAtStart: MINIMUM_CONTROL_REMAINING_HOURS,
        closureProvesElapsedWindowOnly: true,
        uninterruptedRuntimeEvidenceMustBeReviewedSeparately: true,
      },
      expiryWatch,
      checklist: {
        items: checklist,
        blockingSatisfied: checklist
          .filter((item) => item.blocking)
          .every((item) => item.satisfied),
        completed: checklist.filter((item) => item.satisfied).length,
        total: checklist.length,
      },
      runtime: readiness.runtime,
      supply: readiness.supply,
      boundaries: {
        phase24Source: "GET /api/beta/launch-readiness",
        observationLedger: "audit_logs",
        observationLedgerAppendOnly: true,
        observationLedgerTransitionsSerialized: true,
        observationBoundToActivationAuthorization: true,
        observationActionsNeverToggleProviderFlags: true,
        observationCloseNeverClaimsCommercialLaunch: true,
        expiryWatchIsReadOnly: true,
        noAutomaticEvidenceApproval: true,
        noAutomaticBetaAuthorization: true,
        commercialLaunchAuthorized: false,
      },
      generatedAt: new Date(now).toISOString(),
    } as const;
  }

  async startObservation(
    dto: StartLaunchObservationDto,
    actor: BetaEvidenceActor,
  ) {
    await this.withObservationLedgerLock(async (tx) => {
      const [readiness, current, activation, support] = await Promise.all([
        this.launchReadiness.getSnapshot(),
        this.getObservationStatus(tx),
        this.activation.getStatus(),
        this.support.getOperationalSnapshot(),
      ]);

      if (current.state === "CONFLICTED") {
        throw new ConflictException(
          "Observation ledger is conflicted and requires reconciliation.",
        );
      }
      if (["ACTIVE", "ELIGIBLE_TO_CLOSE"].includes(current.state)) {
        throw new ConflictException(
          "A Cartagena beta observation window is already active.",
        );
      }
      if (
        readiness.decision.state !== "GO" ||
        !readiness.runtime.closedBetaEnabled ||
        !readiness.runtime.bookingEnabled ||
        activation.state !== "ACTIVE" ||
        !activation.authorizationId
      ) {
        throw new ConflictException({
          error: "OBSERVATION_START_PREREQUISITES_NOT_SATISFIED",
          launchDecision: readiness.decision.state,
          closedBetaEnabled: readiness.runtime.closedBetaEnabled,
          bookingEnabled: readiness.runtime.bookingEnabled,
          activationState: activation.state,
          blockers: readiness.decision.blockers,
        });
      }

      const authorizationHoursRemaining = this.hoursUntil(
        activation.expiresAt,
        Date.now(),
      );
      const supportHoursRemaining = this.hoursUntil(
        support.expiresAt,
        Date.now(),
      );
      if (
        authorizationHoursRemaining === null ||
        authorizationHoursRemaining < MINIMUM_CONTROL_REMAINING_HOURS ||
        supportHoursRemaining === null ||
        supportHoursRemaining < MINIMUM_CONTROL_REMAINING_HOURS
      ) {
        throw new ConflictException({
          error: "OBSERVATION_CONTROL_LEASE_TOO_SHORT",
          minimumHoursRequired: MINIMUM_CONTROL_REMAINING_HOURS,
          authorizationHoursRemaining,
          supportHoursRemaining,
        });
      }

      await this.appendObservationEvent(
        randomUUID(),
        {
          schemaVersion: 1,
          program: PROGRAM,
          eventType: "STARTED",
          minimumObservationDays: MINIMUM_OBSERVATION_DAYS,
          authorizationId: activation.authorizationId,
          baselineDecision: "GO",
          reason: dto.reason.trim(),
        },
        actor,
        tx,
      );
    });
    return this.getSnapshot();
  }

  async closeObservation(
    dto: CloseLaunchObservationDto,
    actor: BetaEvidenceActor,
  ) {
    await this.withObservationLedgerLock(async (tx) => {
      const [readiness, current, activation] = await Promise.all([
        this.launchReadiness.getSnapshot(),
        this.getObservationStatus(tx),
        this.activation.getStatus(),
      ]);
      if (current.state !== "ELIGIBLE_TO_CLOSE" || !current.observationId) {
        throw new ConflictException(
          "Observation window cannot be closed before the minimum seven-day period has elapsed.",
        );
      }
      if (readiness.decision.state !== "GO") {
        throw new ConflictException({
          error: "OBSERVATION_CLOSE_BLOCKED_BY_LAUNCH_READINESS",
          launchDecision: readiness.decision.state,
          blockers: readiness.decision.blockers,
        });
      }
      if (
        activation.state !== "ACTIVE" ||
        !activation.authorizationId ||
        current.authorizationId !== activation.authorizationId
      ) {
        throw new ConflictException({
          error: "OBSERVATION_AUTHORIZATION_DRIFT",
          observationAuthorizationId: current.authorizationId,
          currentAuthorizationId: activation.authorizationId,
          activationState: activation.state,
        });
      }

      await this.appendObservationEvent(
        current.observationId,
        {
          schemaVersion: 1,
          program: PROGRAM,
          eventType: "CLOSED",
          reason: dto.reason.trim(),
        },
        actor,
        tx,
      );
    });
    return this.getSnapshot();
  }

  async abortObservation(
    dto: AbortLaunchObservationDto,
    actor: BetaEvidenceActor,
  ) {
    await this.withObservationLedgerLock(async (tx) => {
      const current = await this.getObservationStatus(tx);
      if (
        !current.observationId ||
        !["ACTIVE", "ELIGIBLE_TO_CLOSE"].includes(current.state)
      ) {
        throw new ConflictException(
          "There is no active observation window to abort.",
        );
      }

      await this.appendObservationEvent(
        current.observationId,
        {
          schemaVersion: 1,
          program: PROGRAM,
          eventType: "ABORTED",
          reason: dto.reason.trim(),
          incidentReference: dto.incidentReference.trim(),
        },
        actor,
        tx,
      );
    });
    return this.getSnapshot();
  }

  async getObservationStatus(client: ObservationLedgerClient = this.prisma) {
    const events = await this.getObservationEvents(client);
    if (events.length === 0) {
      return this.emptyObservation("MISSING");
    }

    const grouped = new Map<string, ObservationEvent[]>();
    for (const event of events) {
      const stream = grouped.get(event.observationId) ?? [];
      stream.push(event);
      grouped.set(event.observationId, stream);
    }

    const observations = [...grouped.values()].map((stream) =>
      this.deriveObservation(stream),
    );
    const active = observations.filter((item) =>
      ["ACTIVE", "ELIGIBLE_TO_CLOSE"].includes(item.state),
    );
    const conflicted = observations.filter(
      (item) => item.conflictReasons.length > 0,
    );
    if (active.length > 1 || conflicted.length > 0) {
      return {
        ...this.emptyObservation("CONFLICTED"),
        conflictReasons: [
          ...(active.length > 1 ? ["MULTIPLE_ACTIVE_OBSERVATION_WINDOWS"] : []),
          ...conflicted.flatMap((item) => item.conflictReasons),
        ],
      };
    }

    return (
      active[0] ??
      [...observations].sort(
        (a, b) => Date.parse(b.lastEventAt) - Date.parse(a.lastEventAt),
      )[0]
    );
  }

  private deriveObservation(events: ObservationEvent[]) {
    const sorted = [...events].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const observationId = sorted[0].observationId;
    const conflictReasons: string[] = [];
    let startedAt: string | null = null;
    let authorizationId: string | null = null;
    let closedAt: string | null = null;
    let abortedAt: string | null = null;
    let incidentReference: string | null = null;

    for (const event of sorted) {
      if (event.metadata.eventType === "STARTED") {
        if (startedAt) {
          conflictReasons.push("DUPLICATE_START_EVENT");
        } else {
          startedAt = event.createdAt.toISOString();
          authorizationId = event.metadata.authorizationId?.trim() || null;
          if (!authorizationId) {
            conflictReasons.push("AUTHORIZATION_BINDING_MISSING");
          }
        }
      } else if (event.metadata.eventType === "CLOSED") {
        if (!startedAt) conflictReasons.push("CLOSE_WITHOUT_START");
        if (closedAt || abortedAt) {
          conflictReasons.push("DUPLICATE_TERMINAL_EVENT");
        }
        closedAt = event.createdAt.toISOString();
      } else {
        if (!startedAt) conflictReasons.push("ABORT_WITHOUT_START");
        if (closedAt || abortedAt) {
          conflictReasons.push("DUPLICATE_TERMINAL_EVENT");
        }
        abortedAt = event.createdAt.toISOString();
        incidentReference = event.metadata.incidentReference?.trim() || null;
      }
    }

    if (!startedAt) {
      conflictReasons.push("START_EVENT_MISSING");
      startedAt = sorted[0].createdAt.toISOString();
    }

    const elapsedMs = Math.max(0, Date.now() - Date.parse(startedAt));
    const daysElapsed = elapsedMs / DAY_MS;
    let state: ObservationState = "ACTIVE";
    if (conflictReasons.length > 0) state = "CONFLICTED";
    else if (abortedAt) state = "ABORTED";
    else if (closedAt) state = "CLOSED";
    else if (daysElapsed >= MINIMUM_OBSERVATION_DAYS) {
      state = "ELIGIBLE_TO_CLOSE";
    }

    return {
      state,
      observationId,
      authorizationId,
      startedAt,
      eligibleToCloseAt: new Date(
        Date.parse(startedAt) + MINIMUM_OBSERVATION_DAYS * DAY_MS,
      ).toISOString(),
      closedAt,
      abortedAt,
      incidentReference,
      daysElapsed: Number(daysElapsed.toFixed(2)),
      eventCount: sorted.length,
      lastEventAt: sorted.at(-1)?.createdAt.toISOString() ?? startedAt,
      conflictReasons: [...new Set(conflictReasons)],
    };
  }

  private buildExpiryItems(input: {
    activation: Awaited<ReturnType<BetaActivationService["getStatus"]>>;
    evidenceHistory: Awaited<ReturnType<BetaEvidenceService["getHistory"]>>;
    support: Awaited<ReturnType<BetaSupportService["getOperationalSnapshot"]>>;
    now: number;
  }) {
    const items: Array<{
      id: string;
      kind: "AUTHORIZATION" | "SUPPORT" | "EVIDENCE";
      label: string;
      expiresAt: string | null;
      hoursRemaining: number | null;
      state: ExpiryState;
      sourceStatus: string;
    }> = [];

    items.push(
      this.expiryItem(
        "activation-authorization",
        "AUTHORIZATION",
        "Beta activation authorization",
        input.activation.expiresAt,
        input.activation.state,
        input.now,
      ),
    );
    items.push(
      this.expiryItem(
        "support-configuration",
        "SUPPORT",
        "Beta support configuration",
        input.support.expiresAt,
        input.support.state,
        input.now,
      ),
    );

    for (const gate of BETA_EVIDENCE_GATES) {
      const candidates = input.evidenceHistory.evidence
        .filter(
          (item) =>
            item.gate === gate &&
            item.environment === "production" &&
            ["APPROVED", "EXPIRED"].includes(item.status),
        )
        .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
      const selected =
        candidates.find((item) => item.status === "APPROVED") ?? candidates[0];
      if (!selected) continue;
      items.push(
        this.expiryItem(
          `evidence-${gate}`,
          "EVIDENCE",
          this.gateLabel(gate),
          selected.expiresAt,
          selected.status,
          input.now,
        ),
      );
    }
    return items;
  }

  private expiryItem(
    id: string,
    kind: "AUTHORIZATION" | "SUPPORT" | "EVIDENCE",
    label: string,
    expiresAt: string | null,
    sourceStatus: string,
    now: number,
  ) {
    if (!expiresAt) {
      return {
        id,
        kind,
        label,
        expiresAt: null,
        hoursRemaining: null,
        state: "NON_EXPIRING" as ExpiryState,
        sourceStatus,
      };
    }
    const hoursRemaining = (Date.parse(expiresAt) - now) / HOUR_MS;
    let state: ExpiryState = "HEALTHY";
    if (hoursRemaining <= 0 || sourceStatus === "EXPIRED") state = "EXPIRED";
    else if (hoursRemaining <= 6) state = "CRITICAL";
    else if (hoursRemaining <= 24) state = "WARNING";
    else if (hoursRemaining <= 72) state = "ATTENTION";
    return {
      id,
      kind,
      label,
      expiresAt,
      hoursRemaining: Number(hoursRemaining.toFixed(2)),
      state,
      sourceStatus,
    };
  }

  private buildExpiryWatch(
    items: ReturnType<CartagenaLaunchOperationsService["buildExpiryItems"]>,
  ) {
    const weight: Record<ExpiryState, number> = {
      NON_EXPIRING: 0,
      HEALTHY: 1,
      ATTENTION: 2,
      WARNING: 3,
      CRITICAL: 4,
      EXPIRED: 5,
    };
    const state = items.reduce<ExpiryState>(
      (worst, item) =>
        weight[item.state] > weight[worst] ? item.state : worst,
      "NON_EXPIRING",
    );
    const expiring = items
      .filter((item) => item.expiresAt)
      .sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!));
    return {
      state,
      attentionWindowHours: 72,
      warningWindowHours: 24,
      criticalWindowHours: 6,
      earliestExpiryAt: expiring[0]?.expiresAt ?? null,
      attentionCount: items.filter((item) => item.state === "ATTENTION").length,
      warningCount: items.filter((item) => item.state === "WARNING").length,
      criticalCount: items.filter((item) => item.state === "CRITICAL").length,
      expiredCount: items.filter((item) => item.state === "EXPIRED").length,
      items,
      readOnly: true,
    } as const;
  }

  private resolveOperatorAction(input: {
    effectiveDecision: "GO" | "HOLD" | "PAUSE";
    baselineDecision: "GO" | "HOLD" | "PAUSE";
    closedBetaEnabled: boolean;
    observation: Awaited<
      ReturnType<CartagenaLaunchOperationsService["getObservationStatus"]>
    >;
    expiryState: ExpiryState;
  }) {
    if (input.effectiveDecision === "PAUSE") {
      return "KEEP_BOOKING_PAUSED_AND_REMEDIATE" as const;
    }
    if (input.baselineDecision === "HOLD") {
      return "CLEAR_PHASE24_BLOCKERS" as const;
    }
    if (["CRITICAL", "EXPIRED"].includes(input.expiryState)) {
      return "RENEW_OR_REPLACE_EXPIRING_CONTROLS" as const;
    }
    if (!input.closedBetaEnabled) {
      return "ENABLE_BETA_ONLY_THROUGH_OPERATOR_PROVIDER_ACTION" as const;
    }
    if (["MISSING", "ABORTED", "CONFLICTED"].includes(input.observation.state)) {
      return "START_OR_RECONCILE_OBSERVATION_WINDOW" as const;
    }
    if (input.observation.state === "ELIGIBLE_TO_CLOSE") {
      return "REVIEW_AND_CLOSE_OBSERVATION_WINDOW" as const;
    }
    if (input.observation.state === "ACTIVE") {
      return "CONTINUE_CONTROLLED_OBSERVATION" as const;
    }
    return "CONTINUE_CONTROLLED_CARTAGENA_BETA" as const;
  }

  private emptyObservation(state: ObservationState) {
    return {
      state,
      observationId: null,
      authorizationId: null,
      startedAt: null,
      eligibleToCloseAt: null,
      closedAt: null,
      abortedAt: null,
      incidentReference: null,
      daysElapsed: 0,
      eventCount: 0,
      lastEventAt: null,
      conflictReasons: [] as string[],
    };
  }

  private async withObservationLedgerLock<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${OBSERVATION_LEDGER_LOCK_KEY})`;
      return work(tx);
    });
  }

  private async appendObservationEvent(
    observationId: string,
    metadata: ObservationMetadata,
    actor: BetaEvidenceActor,
    client: ObservationLedgerClient = this.prisma,
  ) {
    await client.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: actor.role,
        actorIp: actor.ip?.split(",")[0].trim().slice(0, 45),
        actorUserAgent: actor.userAgent?.trim().slice(0, 500),
        action: AuditAction.CONFIG_CHANGED,
        severity:
          metadata.eventType === "ABORTED"
            ? AuditSeverity.WARN
            : AuditSeverity.INFO,
        targetType: OBSERVATION_TARGET_TYPE,
        targetId: observationId,
        reason: `Cartagena launch observation ${metadata.eventType.toLowerCase()}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getObservationEvents(
    client: ObservationLedgerClient = this.prisma,
  ): Promise<ObservationEvent[]> {
    const rows = await client.auditLog.findMany({
      where: {
        action: AuditAction.CONFIG_CHANGED,
        targetType: OBSERVATION_TARGET_TYPE,
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EVENT_ROWS + 1,
      select: { targetId: true, createdAt: true, metadata: true },
    });
    if (rows.length > MAX_EVENT_ROWS) {
      throw new ServiceUnavailableException(
        "Cartagena observation ledger exceeded the safe operational read boundary.",
      );
    }
    return rows
      .map((row) => {
        if (!row.targetId) return null;
        const metadata = this.parseObservationMetadata(row.metadata);
        if (!metadata) return null;
        return {
          observationId: row.targetId,
          createdAt: row.createdAt,
          metadata,
        } satisfies ObservationEvent;
      })
      .filter((event): event is ObservationEvent => Boolean(event));
  }

  private parseObservationMetadata(
    value: Prisma.JsonValue | null,
  ): ObservationMetadata | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const raw = value as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.program !== PROGRAM) return null;
    if (!["STARTED", "CLOSED", "ABORTED"].includes(String(raw.eventType))) {
      return null;
    }
    return raw as unknown as ObservationMetadata;
  }

  private hoursUntil(value: string | null, now: number) {
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    return (Date.parse(value) - now) / HOUR_MS;
  }

  private gateLabel(gate: BetaEvidenceGate) {
    const labels: Record<BetaEvidenceGate, string> = {
      rcPromoted: "RC promotion evidence",
      productionBackupConfigured: "Production backup evidence",
      restoreDrillVerified: "Restore drill evidence",
      productionAlertingVerified: "Production alerting evidence",
      paymentRailVerified: "Real payment rail evidence",
      cartagenaVetCoverageVerified: "Cartagena VET coverage evidence",
      clientCohortConfigured: "Client cohort evidence",
      supportOwnerConfirmed: "Support owner evidence",
      privacyAndTermsReviewed: "Privacy and terms review evidence",
      rollbackDrillVerified: "Rollback drill evidence",
    };
    return labels[gate];
  }
}
