import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { BetaEvidenceService } from "../beta/beta-evidence.service";
import { HealthService } from "../health/health.service";
import { PrismaService } from "../prisma/prisma.service";
import { RuntimeTelemetryService } from "./runtime-telemetry.service";
import { ServiceQualityTelemetryService } from "./service-quality-telemetry.service";

const DEFAULT_WINDOW_HOURS = 24;
const MIN_WINDOW_HOURS = 1;
const MAX_WINDOW_HOURS = 168;
const MINIMUM_SAMPLE_SIZE = 20;
const MAX_AUDIT_ROWS = 10_000;
const HOUR_MS = 60 * 60 * 1000;

const TARGETS = {
  authenticatedSessionSuccessRatePct: 98,
  ctgFederationExchangeSuccessRatePct: 95,
  apiFailureRatePct: 2,
  ctgFederationLatencyP95Ms: 5000,
} as const;

type MetricState = "PASS" | "BREACHED" | "INSUFFICIENT_DATA";

type Metric = {
  id: string;
  state: MetricState;
  value: number | null;
  target: number;
  comparator: "GTE" | "LTE";
  sampleSize: number;
  source: string;
};

@Injectable()
export class ReleaseHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: RuntimeTelemetryService,
    private readonly serviceQuality: ServiceQualityTelemetryService,
    private readonly betaEvidence: BetaEvidenceService,
    private readonly health: HealthService,
  ) {}

  async getSnapshot(windowHours = DEFAULT_WINDOW_HOURS) {
    const hours = this.normalizeWindowHours(windowHours);
    const now = new Date();
    const from = new Date(now.getTime() - hours * HOUR_MS);

    const [auditRows, runtime, serviceQuality, betaEvidence, readiness] =
      await Promise.all([
        this.prisma.auditLog.findMany({
          where: {
            createdAt: { gte: from, lte: now },
            action: {
              in: [
                AuditAction.LOGIN_SUCCESS,
                AuditAction.LOGIN_FAILED,
                AuditAction.NVET_IDENTITY_EXCHANGE_FAILURE,
              ],
            },
          },
          select: {
            action: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: MAX_AUDIT_ROWS + 1,
        }),
        Promise.resolve(this.runtime.getSnapshot(hours)),
        this.serviceQuality.getSnapshot({ windowHours: hours }),
        this.betaEvidence.getPromotionSummary(),
        this.health.getReadiness(),
      ]);

    const auditTruncated = auditRows.length > MAX_AUDIT_ROWS;
    const boundedAuditRows = auditRows.slice(0, MAX_AUDIT_ROWS);
    const loginSuccess = boundedAuditRows.filter(
      (row) => row.action === AuditAction.LOGIN_SUCCESS,
    );
    const loginFailure = boundedAuditRows.filter(
      (row) => row.action === AuditAction.LOGIN_FAILED,
    );
    const ctgExchangeFailures = boundedAuditRows.filter(
      (row) => row.action === AuditAction.NVET_IDENTITY_EXCHANGE_FAILURE,
    );
    const ctgLoginSuccess = loginSuccess.filter(
      (row) => row.reason === "login_ctg_identity_exchange",
    );
    const ctgLoginFailure = loginFailure.filter((row) =>
      row.reason?.includes("ctg_identity_exchange"),
    );

    const authAttempts =
      loginSuccess.length + loginFailure.length + ctgExchangeFailures.length;
    const ctgAttempts =
      ctgLoginSuccess.length +
      ctgLoginFailure.length +
      ctgExchangeFailures.length;

    const metrics: Metric[] = [
      this.lowerBoundMetric({
        id: "authenticated-session-success-rate",
        value: this.percent(loginSuccess.length, authAttempts),
        target: TARGETS.authenticatedSessionSuccessRatePct,
        sampleSize: authAttempts,
        source: "audit_logs",
      }),
      this.lowerBoundMetric({
        id: "ctg-federation-exchange-success-rate",
        value: this.percent(ctgLoginSuccess.length, ctgAttempts),
        target: TARGETS.ctgFederationExchangeSuccessRatePct,
        sampleSize: ctgAttempts,
        source: "audit_logs",
      }),
      this.upperBoundMetric({
        id: "mobile-api-failure-rate",
        value: runtime.api.failureRatePct,
        target: TARGETS.apiFailureRatePct,
        sampleSize: runtime.api.sampleSize,
        source: "mobile-runtime-telemetry",
      }),
      this.upperBoundMetric({
        id: "ctg-federation-client-latency-p95",
        value: runtime.ctgFederationClient.latencyP95Ms,
        target: TARGETS.ctgFederationLatencyP95Ms,
        sampleSize: runtime.ctgFederationClient.sampleSize,
        source: "mobile-runtime-telemetry",
      }),
    ];

    const breachedMetrics = metrics.filter((metric) => metric.state === "BREACHED");
    const insufficientMetrics = metrics.filter(
      (metric) => metric.state === "INSUFFICIENT_DATA",
    );
    const serviceQualityBreached = serviceQuality.slo.overall === "BREACHED";
    const backendDown = readiness.status === "down";

    const decision = backendDown || serviceQualityBreached || breachedMetrics.length > 0
      ? "BLOCKED"
      : insufficientMetrics.length > 0 || !betaEvidence.eligibleForOperatorActivation
        ? "OBSERVING"
        : "READY_FOR_OPERATOR_BETA_REVIEW";

    return {
      phase: 36,
      program: "production-observability-real-beta-validation",
      window: {
        hours,
        from: from.toISOString(),
        to: now.toISOString(),
      },
      decision,
      backend: {
        readiness: readiness.status,
        revision: readiness.revision,
        database: readiness.checks.database?.status ?? "unknown",
      },
      authentication: {
        auditRows: boundedAuditRows.length,
        auditTruncated,
        success: loginSuccess.length,
        failure: loginFailure.length + ctgExchangeFailures.length,
        ctgSuccess: ctgLoginSuccess.length,
        ctgFailure: ctgLoginFailure.length + ctgExchangeFailures.length,
      },
      runtime,
      serviceQuality: {
        overall: serviceQuality.slo.overall,
        minimumSampleSize: serviceQuality.slo.minimumSampleSize,
        metrics: serviceQuality.slo.metrics,
      },
      betaEvidence: {
        eligibleForOperatorActivation:
          betaEvidence.eligibleForOperatorActivation,
        verifiedGates: betaEvidence.verifiedGates,
        pendingGates: betaEvidence.pendingGates,
        conflictedGates: betaEvidence.conflictedGates,
        appendOnly: betaEvidence.appendOnly,
        automaticTelemetryDoesNotApproveEvidence: true,
      },
      releaseHealth: {
        targets: TARGETS,
        minimumSampleSize: MINIMUM_SAMPLE_SIZE,
        metrics,
        breachedMetricIds: breachedMetrics.map((metric) => metric.id),
        insufficientMetricIds: insufficientMetrics.map((metric) => metric.id),
        releasePromotionEligible: decision === "READY_FOR_OPERATOR_BETA_REVIEW",
      },
      externalEvidence: {
        playVitalsCrashAndAnr: "operator-required",
        physicalDeviceMatrix: "operator-required",
        realBetaCohort: "operator-required",
        elapsedObservationWindow: "operator-required",
      },
      boundaries: {
        readOnly: true,
        mutatesProductionDatabase: false,
        exposesUserIdentifiers: false,
        automaticBetaEvidenceApproval: false,
        automaticPublicRollout: false,
        commercialLaunchAuthorized: false,
      },
      generatedAt: now.toISOString(),
    } as const;
  }

  private normalizeWindowHours(value: number) {
    if (
      !Number.isInteger(value) ||
      value < MIN_WINDOW_HOURS ||
      value > MAX_WINDOW_HOURS
    ) {
      throw new BadRequestException({
        error: "RELEASE_HEALTH_WINDOW_INVALID",
        minimumHours: MIN_WINDOW_HOURS,
        maximumHours: MAX_WINDOW_HOURS,
      });
    }
    return value;
  }

  private percent(numerator: number, denominator: number) {
    if (denominator === 0) return null;
    return Math.round((numerator / denominator) * 10_000) / 100;
  }

  private lowerBoundMetric(input: {
    id: string;
    value: number | null;
    target: number;
    sampleSize: number;
    source: string;
  }): Metric {
    return {
      ...input,
      comparator: "GTE",
      state:
        input.sampleSize < MINIMUM_SAMPLE_SIZE || input.value === null
          ? "INSUFFICIENT_DATA"
          : input.value >= input.target
            ? "PASS"
            : "BREACHED",
    };
  }

  private upperBoundMetric(input: {
    id: string;
    value: number | null;
    target: number;
    sampleSize: number;
    source: string;
  }): Metric {
    return {
      ...input,
      comparator: "LTE",
      state:
        input.sampleSize < MINIMUM_SAMPLE_SIZE || input.value === null
          ? "INSUFFICIENT_DATA"
          : input.value <= input.target
            ? "PASS"
            : "BREACHED",
    };
  }
}
