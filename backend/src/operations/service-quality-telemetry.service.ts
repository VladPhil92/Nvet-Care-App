import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  PaymentMethod,
  TransactionStatus,
} from "@prisma/client";
import { CartagenaLaunchOperationsService } from "../beta/cartagena-launch-operations.service";
import { CoverageService } from "../coverage/coverage.service";
import { PrismaService } from "../prisma/prisma.service";

const PROGRAM = "production-service-quality-phase-26";
const DEFAULT_MARKET_DANE_CODE = "13001";
const DEFAULT_WINDOW_HOURS = 168;
const MIN_WINDOW_HOURS = 1;
const MAX_WINDOW_HOURS = 720;
const MAX_APPOINTMENTS = 5000;
const MINIMUM_SLO_SAMPLE = 10;
const SERVICE_COMPLETION_GRACE_MINUTES = 180;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const INTERNAL_SLO_TARGETS = {
  serviceStartDelayP95Minutes: 30,
  completionRatePct: 85,
  cancellationRatePct: 15,
  disputeRatePct: 5,
  paymentFailureRatePct: 5,
  dataQualityIssueRatePct: 2,
} as const;

const RESOLVED_TRANSACTION_STATUSES = new Set<TransactionStatus>([
  TransactionStatus.CONFIRMED,
  TransactionStatus.LIQUIDATED,
  TransactionStatus.DISPUTED,
  TransactionStatus.FAILED,
]);

const NEEDS_IN_PROGRESS_TIMESTAMP = new Set<AppointmentStatus>([
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.DISPUTED,
]);

const NEEDS_VERIFIED_PAYMENT_TIMESTAMP = new Set<TransactionStatus>([
  TransactionStatus.CONFIRMED,
  TransactionStatus.LIQUIDATED,
]);

type SloMetricState = "PASS" | "WATCH" | "BREACHED" | "INSUFFICIENT_DATA";
type OverallSloState = "HEALTHY" | "WATCH" | "BREACHED" | "INSUFFICIENT_DATA";

type LatencySummary = {
  sampleSize: number;
  medianMinutes: number | null;
  p95Minutes: number | null;
  maxMinutes: number | null;
};

type CensoredLatencySummary = LatencySummary & {
  censoredSampleSize: number;
  exactSampleSize: number;
  overdueWithoutEvent: number;
};

type SloMetric = {
  id: string;
  label: string;
  state: SloMetricState;
  value: number | null;
  target: number;
  comparator: "LTE" | "GTE";
  unit: "minutes" | "percent";
  sampleSize: number;
};

type AppointmentRow = {
  status: AppointmentStatus;
  date: Date;
  time: string;
  scheduledAt: Date | null;
  createdAt: Date;
  confirmedAt: Date | null;
  inProgressAt: Date | null;
  completedAt: Date | null;
  lastStatusChangeAt: Date | null;
  vet: {
    city: string | null;
    department: string | null;
  };
  transaction: {
    status: TransactionStatus;
    paymentMethod: PaymentMethod;
    createdAt: Date;
    verifiedAt: Date | null;
    liquidatedAt: Date | null;
  } | null;
};

type TransactionRow = NonNullable<AppointmentRow["transaction"]>;

@Injectable()
export class ServiceQualityTelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageService,
    private readonly launchOperations: CartagenaLaunchOperationsService,
  ) {}

  async getSnapshot(input?: { windowHours?: number; marketDaneCode?: string }) {
    const windowHours = this.normalizeWindowHours(input?.windowHours);
    const marketDaneCode =
      input?.marketDaneCode?.trim() || DEFAULT_MARKET_DANE_CODE;
    const catalog = this.coverage.getCatalog();
    const market = catalog.markets.find(
      (candidate) => candidate.daneCode === marketDaneCode,
    );
    if (!market) {
      throw new BadRequestException({
        error: "SERVICE_QUALITY_MARKET_UNSUPPORTED",
        marketDaneCode,
      });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowHours * HOUR_MS);
    const [rows, launch] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { createdAt: { gte: windowStart, lte: now } },
        orderBy: { createdAt: "desc" },
        take: MAX_APPOINTMENTS + 1,
        select: {
          status: true,
          date: true,
          time: true,
          scheduledAt: true,
          createdAt: true,
          confirmedAt: true,
          inProgressAt: true,
          completedAt: true,
          lastStatusChangeAt: true,
          vet: {
            select: {
              city: true,
              department: true,
            },
          },
          transaction: {
            select: {
              status: true,
              paymentMethod: true,
              createdAt: true,
              verifiedAt: true,
              liquidatedAt: true,
            },
          },
        },
      }),
      marketDaneCode === DEFAULT_MARKET_DANE_CODE
        ? this.launchOperations.getSnapshot()
        : Promise.resolve(null),
    ]);

    if (rows.length > MAX_APPOINTMENTS) {
      throw new ServiceUnavailableException({
        error: "SERVICE_QUALITY_WINDOW_TOO_DENSE",
        maxRows: MAX_APPOINTMENTS,
        windowHours,
      });
    }

    const scopedRows = rows.filter(
      (row) =>
        this.coverage.resolveMarketByCity(row.vet.city, row.vet.department)
          ?.daneCode === marketDaneCode,
    );
    const unresolvedMarketRows = rows.filter(
      (row) =>
        this.coverage.resolveMarketByCity(row.vet.city, row.vet.department) ===
        null,
    ).length;

    const appointmentStatusCounts = this.appointmentStatusCounts(scopedRows);
    const transactionRows = scopedRows.flatMap((row) =>
      row.transaction ? [row.transaction] : [],
    );
    const resolvedTransactions = transactionRows.filter((row) =>
      RESOLVED_TRANSACTION_STATUSES.has(row.status),
    );
    const transactionStatusCounts =
      this.transactionStatusCounts(transactionRows);
    const paymentMethodCounts = this.paymentMethodCounts(transactionRows);

    const confirmedEver = scopedRows.filter((row) => row.confirmedAt).length;
    const completedEver = scopedRows.filter((row) => row.completedAt).length;
    const matureOutcomeRows = scopedRows.filter((row) =>
      this.isOutcomeMature(row, now),
    );
    const completedMature = matureOutcomeRows.filter(
      (row) => row.completedAt !== null,
    ).length;
    const cancelledMature = matureOutcomeRows.filter(
      (row) =>
        row.status === AppointmentStatus.CANCELLED && row.completedAt === null,
    ).length;
    const disputedMature = matureOutcomeRows.filter(
      (row) => row.status === AppointmentStatus.DISPUTED,
    ).length;

    const bookingConfirmation = this.latency(
      scopedRows,
      (row) => row.createdAt,
      (row) => row.confirmedAt,
    );
    const unavailableVetResponse = this.summarizeLatencies([]);
    const serviceStartDelay = this.censoredServiceStartDelay(scopedRows, now);
    const confirmedToStart = this.latency(
      scopedRows,
      (row) => row.confirmedAt,
      (row) => row.inProgressAt,
    );
    const serviceDuration = this.latency(
      scopedRows,
      (row) => row.inProgressAt,
      (row) => row.completedAt,
    );
    const paymentVerification = this.latency(
      transactionRows,
      (row) => row.createdAt,
      (row) => row.verifiedAt,
    );
    const settlement = this.latency(
      transactionRows,
      (row) => row.verifiedAt,
      (row) => row.liquidatedAt,
    );

    const dataQuality = this.buildDataQuality(scopedRows);
    const appointmentTotal = scopedRows.length;
    const transactionTotal = transactionRows.length;
    const matureOutcomeCount = matureOutcomeRows.length;
    const completionRatePct = this.percent(completedMature, matureOutcomeCount);
    const cancellationRatePct = this.percent(
      cancelledMature,
      matureOutcomeCount,
    );
    const disputeRatePct = this.percent(disputedMature, matureOutcomeCount);
    const paymentFailureRatePct = this.percent(
      resolvedTransactions.filter(
        (row) => row.status === TransactionStatus.FAILED,
      ).length,
      resolvedTransactions.length,
    );
    const paymentDisputeRatePct = this.percent(
      resolvedTransactions.filter(
        (row) => row.status === TransactionStatus.DISPUTED,
      ).length,
      resolvedTransactions.length,
    );
    const dataQualityIssueRatePct = this.percent(
      dataQuality.appointmentsWithIssues,
      appointmentTotal,
    );

    const sloMetrics: SloMetric[] = [
      this.upperBoundMetric({
        id: "service-start-delay-p95",
        label: "Service start delay p95",
        value: serviceStartDelay.p95Minutes,
        target: INTERNAL_SLO_TARGETS.serviceStartDelayP95Minutes,
        unit: "minutes",
        sampleSize: serviceStartDelay.sampleSize,
      }),
      this.lowerBoundMetric({
        id: "completion-rate",
        label: "Mature appointment completion rate",
        value: completionRatePct,
        target: INTERNAL_SLO_TARGETS.completionRatePct,
        unit: "percent",
        sampleSize: matureOutcomeCount,
      }),
      this.upperBoundMetric({
        id: "cancellation-rate",
        label: "Mature appointment cancellation rate",
        value: cancellationRatePct,
        target: INTERNAL_SLO_TARGETS.cancellationRatePct,
        unit: "percent",
        sampleSize: matureOutcomeCount,
      }),
      this.upperBoundMetric({
        id: "dispute-rate",
        label: "Mature appointment dispute rate",
        value: disputeRatePct,
        target: INTERNAL_SLO_TARGETS.disputeRatePct,
        unit: "percent",
        sampleSize: matureOutcomeCount,
      }),
      this.upperBoundMetric({
        id: "payment-failure-rate",
        label: "Resolved payment failure rate",
        value: paymentFailureRatePct,
        target: INTERNAL_SLO_TARGETS.paymentFailureRatePct,
        unit: "percent",
        sampleSize: resolvedTransactions.length,
      }),
      this.upperBoundMetric({
        id: "data-quality-issue-rate",
        label: "Telemetry data-quality issue rate",
        value: dataQualityIssueRatePct,
        target: INTERNAL_SLO_TARGETS.dataQualityIssueRatePct,
        unit: "percent",
        sampleSize: appointmentTotal,
      }),
    ];
    const overallSloState = this.overallSloState(sloMetrics);

    return {
      phase: 26,
      program: PROGRAM,
      market: {
        code: market.code,
        daneCode: market.daneCode,
        city: market.city,
        department: market.department,
      },
      window: {
        hours: windowHours,
        from: windowStart.toISOString(),
        to: now.toISOString(),
        basis: "appointment.createdAt",
        maxRows: MAX_APPOINTMENTS,
      },
      appointments: {
        total: appointmentTotal,
        statusCounts: appointmentStatusCounts,
        confirmedEver,
        completedEver,
        cancelledBeforeCompletion: scopedRows.filter(
          (row) =>
            row.status === AppointmentStatus.CANCELLED &&
            row.completedAt === null,
        ).length,
        terminalOutcomeCount: matureOutcomeCount,
        outcomeEvaluableCount: matureOutcomeCount,
        matureOutcomeCount,
        immatureOutcomeCount: appointmentTotal - matureOutcomeCount,
        confirmationRatePct: this.percent(confirmedEver, appointmentTotal),
        completionRatePct,
        cancellationRatePct,
        disputeRatePct,
        outcomeRatesExcludeImmatureAppointments: true,
        maturityGraceMinutes: SERVICE_COMPLETION_GRACE_MINUTES,
      },
      latency: {
        vetResponseMinutes: unavailableVetResponse,
        vetResponseSloMinutes: {
          ...unavailableVetResponse,
          censoredSampleSize: 0,
          exactSampleSize: 0,
          overdueWithoutEvent: 0,
        },
        bookingConfirmationMinutes: bookingConfirmation,
        serviceStartDelayMinutes: serviceStartDelay,
        confirmedToStartMinutes: confirmedToStart,
        serviceDurationMinutes: serviceDuration,
        semantics: {
          vetResponse:
            "not measured: no veterinarian-exclusive durable response event is persisted",
          vetResponseMeasured: false,
          bookingConfirmation: "appointment.createdAt -> confirmedAt",
          bookingConfirmationMayBeFinanciallyTriggered: true,
          serviceStartDelay:
            "scheduled service time -> inProgressAt; mature missing starts use elapsed lower-bound observation",
          confirmedToStart: "confirmedAt -> inProgressAt",
          serviceDuration: "inProgressAt -> completedAt",
          assignmentLatencyMeasured: false,
          survivorBiasControlled: true,
          reason:
            "Appointment.vetId is already selected at creation; no independent assignment event is persisted, and confirmedAt can be written by financial confirmation paths.",
        },
      },
      payments: {
        transactions: transactionTotal,
        resolvedTransactions: resolvedTransactions.length,
        unresolvedTransactions: transactionTotal - resolvedTransactions.length,
        transactionCoverageRatePct: this.percent(
          transactionTotal,
          appointmentTotal,
        ),
        statusCounts: transactionStatusCounts,
        methodCounts: paymentMethodCounts,
        verifiedEver: transactionRows.filter((row) => row.verifiedAt).length,
        liquidatedEver: transactionRows.filter((row) => row.liquidatedAt)
          .length,
        failureRatePct: paymentFailureRatePct,
        disputeRatePct: paymentDisputeRatePct,
        failureRateExcludesPendingAndVerifying: true,
        verificationLatencyMinutes: paymentVerification,
        settlementLatencyMinutes: settlement,
      },
      dataQuality: {
        ...dataQuality,
        issueRatePct: dataQualityIssueRatePct,
        unresolvedMarketAppointmentsInWindow: unresolvedMarketRows,
      },
      slo: {
        overall: overallSloState,
        minimumSampleSize: MINIMUM_SLO_SAMPLE,
        targets: INTERNAL_SLO_TARGETS,
        metrics: sloMetrics,
        policySource: "internal-beta-operating-targets",
        targetsAreCustomerPromises: false,
        automaticallyChangesLaunchDecision: false,
        insufficientMetricMakesOverallInsufficient: true,
      },
      observationContext: launch
        ? {
            phase25Decision: launch.decision.effective,
            observationState: launch.observation.state,
            daysElapsed: launch.observation.daysElapsed,
            closedBetaEnabled: launch.runtime.closedBetaEnabled,
          }
        : null,
      operatorAction: this.operatorAction({
        overallSloState,
        dataQualityIssues: dataQuality.appointmentsWithIssues,
      }),
      boundaries: {
        readOnly: true,
        aggregateOnly: true,
        exposesUserIdentifiers: false,
        exposesAddresses: false,
        exposesCoordinates: false,
        mutatesProviderConfiguration: false,
        approvesEvidence: false,
        commercialLaunchAuthorized: false,
      },
      generatedAt: now.toISOString(),
    } as const;
  }

  private normalizeWindowHours(value?: number) {
    const candidate = value ?? DEFAULT_WINDOW_HOURS;
    if (
      !Number.isInteger(candidate) ||
      candidate < MIN_WINDOW_HOURS ||
      candidate > MAX_WINDOW_HOURS
    ) {
      throw new BadRequestException({
        error: "SERVICE_QUALITY_WINDOW_INVALID",
        minimumHours: MIN_WINDOW_HOURS,
        maximumHours: MAX_WINDOW_HOURS,
      });
    }
    return candidate;
  }

  private appointmentStatusCounts(rows: AppointmentRow[]) {
    const counts: Record<AppointmentStatus, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      DISPUTED: 0,
    };
    for (const row of rows) counts[row.status] += 1;
    return counts;
  }

  private transactionStatusCounts(rows: TransactionRow[]) {
    const counts: Record<TransactionStatus, number> = {
      PENDING: 0,
      VERIFYING: 0,
      CONFIRMED: 0,
      LIQUIDATED: 0,
      DISPUTED: 0,
      FAILED: 0,
    };
    for (const row of rows) counts[row.status] += 1;
    return counts;
  }

  private paymentMethodCounts(rows: TransactionRow[]) {
    const counts: Record<PaymentMethod, number> = {
      CTG: 0,
      PSE: 0,
      TRANSFER: 0,
    };
    for (const row of rows) counts[row.paymentMethod] += 1;
    return counts;
  }

  private latency<T>(
    rows: T[],
    start: (row: T) => Date | null,
    end: (row: T) => Date | null,
  ): LatencySummary {
    const values = rows
      .map((row) => {
        const startAt = start(row);
        const endAt = end(row);
        if (!startAt || !endAt) return null;
        return this.durationMinutes(startAt, endAt);
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    return this.summarizeLatencies(values);
  }

  private censoredServiceStartDelay(
    rows: AppointmentRow[],
    now: Date,
  ): CensoredLatencySummary {
    const observations: Array<{ minutes: number; censored: boolean }> = [];
    let overdueWithoutEvent = 0;

    for (const row of rows) {
      const scheduled = this.resolveScheduledAt(row);
      if (!scheduled) continue;

      if (row.inProgressAt) {
        const rawMinutes =
          (row.inProgressAt.getTime() - scheduled.getTime()) / MINUTE_MS;
        if (Number.isFinite(rawMinutes)) {
          observations.push({
            minutes: Math.max(0, rawMinutes),
            censored: false,
          });
        }
        continue;
      }

      if (row.status === AppointmentStatus.CANCELLED) continue;
      const elapsedMinutes = (now.getTime() - scheduled.getTime()) / MINUTE_MS;
      if (
        !Number.isFinite(elapsedMinutes) ||
        elapsedMinutes < INTERNAL_SLO_TARGETS.serviceStartDelayP95Minutes
      ) {
        continue;
      }
      observations.push({ minutes: elapsedMinutes, censored: true });
      overdueWithoutEvent += 1;
    }

    const values = observations
      .map((observation) => observation.minutes)
      .sort((a, b) => a - b);
    return {
      ...this.summarizeLatencies(values),
      censoredSampleSize: observations.filter((item) => item.censored).length,
      exactSampleSize: observations.filter((item) => !item.censored).length,
      overdueWithoutEvent,
    };
  }

  private isOutcomeMature(row: AppointmentRow, now: Date) {
    if (
      row.completedAt ||
      row.status === AppointmentStatus.CANCELLED ||
      row.status === AppointmentStatus.DISPUTED
    ) {
      return true;
    }
    const scheduled = this.resolveScheduledAt(row);
    if (!scheduled) return false;
    return (
      scheduled.getTime() + SERVICE_COMPLETION_GRACE_MINUTES * MINUTE_MS <=
      now.getTime()
    );
  }

  private resolveScheduledAt(row: AppointmentRow): Date | null {
    if (row.scheduledAt) return row.scheduledAt;
    if (!/^\d{2}:\d{2}$/.test(row.time)) return null;
    const dateOnly = row.date.toISOString().slice(0, 10);
    const value = new Date(`${dateOnly}T${row.time}:00-05:00`);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  private summarizeLatencies(values: number[]): LatencySummary {
    return {
      sampleSize: values.length,
      medianMinutes: this.percentile(values, 0.5),
      p95Minutes: this.percentile(values, 0.95),
      maxMinutes: values.length
        ? Number(values[values.length - 1].toFixed(2))
        : null,
    };
  }

  private durationMinutes(startAt: Date, endAt: Date) {
    const minutes = (endAt.getTime() - startAt.getTime()) / MINUTE_MS;
    return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
  }

  private percentile(values: number[], quantile: number) {
    if (values.length === 0) return null;
    const index = Math.max(
      0,
      Math.min(values.length - 1, Math.ceil(quantile * values.length) - 1),
    );
    return Number(values[index].toFixed(2));
  }

  private percent(numerator: number, denominator: number) {
    if (denominator === 0) return null;
    return Number(((numerator / denominator) * 100).toFixed(2));
  }

  private buildDataQuality(rows: AppointmentRow[]) {
    const categories = {
      missingConfirmedTimestamp: 0,
      missingInProgressTimestamp: 0,
      missingCompletedTimestamp: 0,
      missingCancellationStatusTimestamp: 0,
      missingPaymentVerifiedTimestamp: 0,
      missingPaymentLiquidatedTimestamp: 0,
      scheduledTimeUnresolvable: 0,
      appointmentChronologyInvalid: 0,
      paymentChronologyInvalid: 0,
    };
    let appointmentsWithIssues = 0;

    for (const row of rows) {
      let hasIssue = false;

      if (row.status === AppointmentStatus.CONFIRMED && !row.confirmedAt) {
        categories.missingConfirmedTimestamp += 1;
      }
      if (NEEDS_IN_PROGRESS_TIMESTAMP.has(row.status) && !row.inProgressAt) {
        categories.missingInProgressTimestamp += 1;
        hasIssue = true;
      }
      if (row.status === AppointmentStatus.COMPLETED && !row.completedAt) {
        categories.missingCompletedTimestamp += 1;
        hasIssue = true;
      }
      if (
        row.status === AppointmentStatus.CANCELLED &&
        !row.lastStatusChangeAt
      ) {
        categories.missingCancellationStatusTimestamp += 1;
        hasIssue = true;
      }
      if (!this.resolveScheduledAt(row)) {
        categories.scheduledTimeUnresolvable += 1;
        hasIssue = true;
      }
      if (
        this.invalidChronology(row.createdAt, row.confirmedAt) ||
        this.invalidChronology(row.confirmedAt, row.inProgressAt) ||
        this.invalidChronology(row.inProgressAt, row.completedAt)
      ) {
        categories.appointmentChronologyInvalid += 1;
        hasIssue = true;
      }

      if (row.transaction) {
        if (
          NEEDS_VERIFIED_PAYMENT_TIMESTAMP.has(row.transaction.status) &&
          !row.transaction.verifiedAt
        ) {
          categories.missingPaymentVerifiedTimestamp += 1;
          hasIssue = true;
        }
        if (
          row.transaction.status === TransactionStatus.LIQUIDATED &&
          !row.transaction.liquidatedAt
        ) {
          categories.missingPaymentLiquidatedTimestamp += 1;
          hasIssue = true;
        }
        if (
          this.invalidChronology(
            row.transaction.createdAt,
            row.transaction.verifiedAt,
          ) ||
          this.invalidChronology(
            row.transaction.verifiedAt,
            row.transaction.liquidatedAt,
          )
        ) {
          categories.paymentChronologyInvalid += 1;
          hasIssue = true;
        }
      }
      if (hasIssue) appointmentsWithIssues += 1;
    }

    return {
      appointmentsWithIssues,
      categories,
      measurementIntegrity: {
        historicalTransitionsAreDerivedOnlyFromPersistedTimestamps: true,
        cancellationTimestampMayBeLegacyIncomplete: true,
        matureUnconfirmedResponseUsesElapsedLowerBound: false,
        missingConfirmationTimestampIsCoverageGapNotVetResponseFailure: true,
        matureMissingStartUsesElapsedLowerBound: true,
        noSyntheticTimestamps: true,
      },
    } as const;
  }

  private invalidChronology(start: Date | null, end: Date | null) {
    return Boolean(start && end && end.getTime() < start.getTime());
  }

  private upperBoundMetric(input: {
    id: string;
    label: string;
    value: number | null;
    target: number;
    unit: "minutes" | "percent";
    sampleSize: number;
  }): SloMetric {
    let state: SloMetricState = "INSUFFICIENT_DATA";
    if (input.value !== null && input.sampleSize >= MINIMUM_SLO_SAMPLE) {
      if (input.value <= input.target) state = "PASS";
      else if (input.value <= input.target * 1.5) state = "WATCH";
      else state = "BREACHED";
    }
    return { ...input, state, comparator: "LTE" };
  }

  private lowerBoundMetric(input: {
    id: string;
    label: string;
    value: number | null;
    target: number;
    unit: "minutes" | "percent";
    sampleSize: number;
  }): SloMetric {
    let state: SloMetricState = "INSUFFICIENT_DATA";
    if (input.value !== null && input.sampleSize >= MINIMUM_SLO_SAMPLE) {
      if (input.value >= input.target) state = "PASS";
      else if (input.value >= Math.max(0, input.target - 10)) state = "WATCH";
      else state = "BREACHED";
    }
    return { ...input, state, comparator: "GTE" };
  }

  private overallSloState(metrics: SloMetric[]): OverallSloState {
    if (metrics.some((metric) => metric.state === "BREACHED")) {
      return "BREACHED";
    }
    if (metrics.some((metric) => metric.state === "WATCH")) return "WATCH";
    if (metrics.some((metric) => metric.state === "INSUFFICIENT_DATA")) {
      return "INSUFFICIENT_DATA";
    }
    return "HEALTHY";
  }

  private operatorAction(input: {
    overallSloState: OverallSloState;
    dataQualityIssues: number;
  }) {
    if (input.dataQualityIssues > 0) {
      return "REVIEW_TELEMETRY_DATA_INTEGRITY";
    }
    if (input.overallSloState === "INSUFFICIENT_DATA") {
      return "ACCUMULATE_CONTROLLED_BETA_SAMPLE";
    }
    if (input.overallSloState === "BREACHED") return "REMEDIATE_SLO_BREACHES";
    if (input.overallSloState === "WATCH") {
      return "MONITOR_SERVICE_QUALITY_TREND";
    }
    return "CONTINUE_CONTROLLED_SERVICE_OBSERVATION";
  }
}
