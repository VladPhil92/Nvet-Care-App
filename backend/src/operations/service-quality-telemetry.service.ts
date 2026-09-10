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
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const INTERNAL_SLO_TARGETS = {
  vetResponseP95Minutes: 30,
  completionRatePct: 85,
  cancellationRatePct: 15,
  disputeRatePct: 5,
  paymentFailureRatePct: 5,
  dataQualityIssueRatePct: 2,
} as const;

type SloMetricState = "PASS" | "WATCH" | "BREACHED" | "INSUFFICIENT_DATA";
type OverallSloState = "HEALTHY" | "WATCH" | "BREACHED" | "INSUFFICIENT_DATA";

type LatencySummary = {
  sampleSize: number;
  medianMinutes: number | null;
  p95Minutes: number | null;
  maxMinutes: number | null;
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
  createdAt: Date;
  updatedAt: Date;
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
    updatedAt: Date;
    verifiedAt: Date | null;
    liquidatedAt: Date | null;
  } | null;
};

@Injectable()
export class ServiceQualityTelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageService,
    private readonly launchOperations: CartagenaLaunchOperationsService,
  ) {}

  async getSnapshot(input?: {
    windowHours?: number;
    marketDaneCode?: string;
  }) {
    const windowHours = this.normalizeWindowHours(input?.windowHours);
    const marketDaneCode = input?.marketDaneCode?.trim() || DEFAULT_MARKET_DANE_CODE;
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
          createdAt: true,
          updatedAt: true,
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
              updatedAt: true,
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
    const transactionStatusCounts = this.transactionStatusCounts(transactionRows);
    const paymentMethodCounts = this.paymentMethodCounts(transactionRows);

    const confirmedEver = scopedRows.filter((row) => row.confirmedAt).length;
    const completedEver = scopedRows.filter((row) => row.completedAt).length;
    const cancelled = appointmentStatusCounts.CANCELLED;
    const disputed = appointmentStatusCounts.DISPUTED;

    const vetResponse = this.latency(
      scopedRows,
      (row) => row.createdAt,
      (row) => row.confirmedAt,
    );
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
    const completionRatePct = this.percent(completedEver, appointmentTotal);
    const cancellationRatePct = this.percent(cancelled, appointmentTotal);
    const disputeRatePct = this.percent(disputed, appointmentTotal);
    const paymentFailureRatePct = this.percent(
      transactionStatusCounts.FAILED,
      transactionTotal,
    );
    const dataQualityIssueRatePct = this.percent(
      dataQuality.appointmentsWithIssues,
      appointmentTotal,
    );

    const sloMetrics: SloMetric[] = [
      this.upperBoundMetric({
        id: "vet-response-p95",
        label: "VET response p95",
        value: vetResponse.p95Minutes,
        target: INTERNAL_SLO_TARGETS.vetResponseP95Minutes,
        unit: "minutes",
        sampleSize: vetResponse.sampleSize,
      }),
      this.lowerBoundMetric({
        id: "completion-rate",
        label: "Appointment completion rate",
        value: completionRatePct,
        target: INTERNAL_SLO_TARGETS.completionRatePct,
        unit: "percent",
        sampleSize: appointmentTotal,
      }),
      this.upperBoundMetric({
        id: "cancellation-rate",
        label: "Appointment cancellation rate",
        value: cancellationRatePct,
        target: INTERNAL_SLO_TARGETS.cancellationRatePct,
        unit: "percent",
        sampleSize: appointmentTotal,
      }),
      this.upperBoundMetric({
        id: "dispute-rate",
        label: "Appointment dispute rate",
        value: disputeRatePct,
        target: INTERNAL_SLO_TARGETS.disputeRatePct,
        unit: "percent",
        sampleSize: appointmentTotal,
      }),
      this.upperBoundMetric({
        id: "payment-failure-rate",
        label: "Payment failure rate",
        value: paymentFailureRatePct,
        target: INTERNAL_SLO_TARGETS.paymentFailureRatePct,
        unit: "percent",
        sampleSize: transactionTotal,
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
    const overallSloState = this.overallSloState(sloMetrics, appointmentTotal);

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
        confirmationRatePct: this.percent(confirmedEver, appointmentTotal),
        completionRatePct,
        cancellationRatePct,
        disputeRatePct,
      },
      latency: {
        vetResponseMinutes: vetResponse,
        confirmedToStartMinutes: confirmedToStart,
        serviceDurationMinutes: serviceDuration,
        semantics: {
          vetResponse: "appointment.createdAt -> confirmedAt",
          confirmedToStart: "confirmedAt -> inProgressAt",
          serviceDuration: "inProgressAt -> completedAt",
          assignmentLatencyMeasured: false,
          reason:
            "Appointment.vetId is already selected at creation; no independent assignment event is persisted.",
        },
      },
      payments: {
        transactions: transactionTotal,
        transactionCoverageRatePct: this.percent(
          transactionTotal,
          appointmentTotal,
        ),
        statusCounts: transactionStatusCounts,
        methodCounts: paymentMethodCounts,
        verifiedEver: transactionRows.filter((row) => row.verifiedAt).length,
        liquidatedEver: transactionRows.filter((row) => row.liquidatedAt).length,
        failureRatePct: paymentFailureRatePct,
        disputeRatePct: this.percent(
          transactionStatusCounts.DISPUTED,
          transactionTotal,
        ),
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
        appointmentTotal,
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

  private transactionStatusCounts(
    rows: NonNullable<AppointmentRow["transaction"]>[],
  ) {
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

  private paymentMethodCounts(
    rows: NonNullable<AppointmentRow["transaction"]>[],
  ) {
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
        const minutes = (endAt.getTime() - startAt.getTime()) / MINUTE_MS;
        return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    return {
      sampleSize: values.length,
      medianMinutes: this.percentile(values, 0.5),
      p95Minutes: this.percentile(values, 0.95),
      maxMinutes: values.length
        ? Number(values[values.length - 1].toFixed(2))
        : null,
    };
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
      appointmentChronologyInvalid: 0,
      paymentChronologyInvalid: 0,
    };
    let appointmentsWithIssues = 0;

    for (const row of rows) {
      let hasIssue = false;
      const needsConfirmed = [
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.IN_PROGRESS,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.DISPUTED,
      ].includes(row.status);
      const needsInProgress = [
        AppointmentStatus.IN_PROGRESS,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.DISPUTED,
      ].includes(row.status);

      if (needsConfirmed && !row.confirmedAt) {
        categories.missingConfirmedTimestamp += 1;
        hasIssue = true;
      }
      if (needsInProgress && !row.inProgressAt) {
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
      if (
        this.invalidChronology(row.createdAt, row.confirmedAt) ||
        this.invalidChronology(row.confirmedAt, row.inProgressAt) ||
        this.invalidChronology(row.inProgressAt, row.completedAt)
      ) {
        categories.appointmentChronologyInvalid += 1;
        hasIssue = true;
      }
      if (
        row.transaction &&
        (this.invalidChronology(
          row.transaction.createdAt,
          row.transaction.verifiedAt,
        ) ||
          this.invalidChronology(
            row.transaction.verifiedAt,
            row.transaction.liquidatedAt,
          ))
      ) {
        categories.paymentChronologyInvalid += 1;
        hasIssue = true;
      }
      if (hasIssue) appointmentsWithIssues += 1;
    }

    return {
      appointmentsWithIssues,
      categories,
      measurementIntegrity: {
        historicalTransitionsAreDerivedOnlyFromPersistedTimestamps: true,
        cancellationTimestampMayBeLegacyIncomplete: true,
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

  private overallSloState(
    metrics: SloMetric[],
    appointmentTotal: number,
  ): OverallSloState {
    if (appointmentTotal < MINIMUM_SLO_SAMPLE) return "INSUFFICIENT_DATA";
    if (metrics.some((metric) => metric.state === "BREACHED")) {
      return "BREACHED";
    }
    if (metrics.some((metric) => metric.state === "WATCH")) return "WATCH";
    return "HEALTHY";
  }

  private operatorAction(input: {
    overallSloState: OverallSloState;
    appointmentTotal: number;
    dataQualityIssues: number;
  }) {
    if (input.dataQualityIssues > 0) return "REVIEW_TELEMETRY_DATA_INTEGRITY";
    if (input.appointmentTotal < MINIMUM_SLO_SAMPLE) {
      return "ACCUMULATE_CONTROLLED_BETA_SAMPLE";
    }
    if (input.overallSloState === "BREACHED") return "REMEDIATE_SLO_BREACHES";
    if (input.overallSloState === "WATCH") return "MONITOR_SERVICE_QUALITY_TREND";
    return "CONTINUE_CONTROLLED_SERVICE_OBSERVATION";
  }
}
