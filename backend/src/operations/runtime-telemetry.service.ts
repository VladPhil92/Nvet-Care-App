import { Injectable, Logger } from "@nestjs/common";
import {
  RuntimeTelemetryEventDto,
  RuntimeTelemetryEventName,
} from "./dto/runtime-telemetry-event.dto";

const MAX_EVENTS = 5000;
const DEFAULT_WINDOW_HOURS = 24;
const MIN_WINDOW_HOURS = 1;
const MAX_WINDOW_HOURS = 168;
const HOUR_MS = 60 * 60 * 1000;

type RuntimeEvent = {
  event: RuntimeTelemetryEventName;
  receivedAtMs: number;
  durationMs?: number;
  appVersion?: string;
  versionCode?: number;
  outcomeCode?: string;
};

@Injectable()
export class RuntimeTelemetryService {
  private readonly logger = new Logger(RuntimeTelemetryService.name);
  private readonly events: RuntimeEvent[] = [];

  record(dto: RuntimeTelemetryEventDto) {
    const event: RuntimeEvent = {
      event: dto.event,
      receivedAtMs: Date.now(),
      ...(dto.durationMs !== undefined ? { durationMs: dto.durationMs } : {}),
      ...(dto.appVersion ? { appVersion: dto.appVersion } : {}),
      ...(dto.versionCode !== undefined ? { versionCode: dto.versionCode } : {}),
      ...(dto.outcomeCode ? { outcomeCode: dto.outcomeCode } : {}),
    };

    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }

    // Structured provider log: deliberately excludes user ids, request bodies,
    // stack traces, tokens, clinical text, payment credentials and free-form text.
    this.logger.log(
      JSON.stringify({
        kind: "mobile_runtime_telemetry",
        event: event.event,
        receivedAt: new Date(event.receivedAtMs).toISOString(),
        durationMs: event.durationMs ?? null,
        appVersion: event.appVersion ?? null,
        versionCode: event.versionCode ?? null,
        outcomeCode: event.outcomeCode ?? null,
      }),
    );

    return {
      accepted: true,
      event: event.event,
      aggregateOnly: true,
      userIdentityStored: false,
    } as const;
  }

  getSnapshot(windowHours = DEFAULT_WINDOW_HOURS) {
    const normalizedWindowHours = this.normalizeWindowHours(windowHours);
    const now = Date.now();
    const from = now - normalizedWindowHours * HOUR_MS;
    const rows = this.events.filter((event) => event.receivedAtMs >= from);

    const counts = rows.reduce<Record<string, number>>((acc, event) => {
      acc[event.event] = (acc[event.event] ?? 0) + 1;
      return acc;
    }, {});

    const apiSuccess = counts.API_REQUEST_SUCCESS ?? 0;
    const apiFailure = counts.API_REQUEST_FAILURE ?? 0;
    const apiTotal = apiSuccess + apiFailure;
    const ctgSuccess = counts.CTG_FEDERATION_EXCHANGE_SUCCESS ?? 0;
    const ctgFailure = counts.CTG_FEDERATION_EXCHANGE_FAILURE ?? 0;
    const ctgTotal = ctgSuccess + ctgFailure;

    return {
      program: "mobile-runtime-observability-phase-36",
      storage: {
        aggregateBuffer: "instance-memory",
        maxEvents: MAX_EVENTS,
        providerStructuredLogs: true,
        durableBetaEvidence: false,
      },
      window: {
        hours: normalizedWindowHours,
        from: new Date(from).toISOString(),
        to: new Date(now).toISOString(),
      },
      samples: rows.length,
      counts,
      api: {
        sampleSize: apiTotal,
        success: apiSuccess,
        failure: apiFailure,
        failureRatePct: this.percent(apiFailure, apiTotal),
        latencyP95Ms: this.p95(
          rows
            .filter(
              (event) =>
                (event.event === "API_REQUEST_SUCCESS" ||
                  event.event === "API_REQUEST_FAILURE") &&
                event.durationMs !== undefined,
            )
            .map((event) => event.durationMs as number),
        ),
      },
      ctgFederationClient: {
        sampleSize: ctgTotal,
        success: ctgSuccess,
        failure: ctgFailure,
        successRatePct: this.percent(ctgSuccess, ctgTotal),
        latencyP95Ms: this.p95(
          rows
            .filter(
              (event) =>
                (event.event === "CTG_FEDERATION_EXCHANGE_SUCCESS" ||
                  event.event === "CTG_FEDERATION_EXCHANGE_FAILURE") &&
                event.durationMs !== undefined,
            )
            .map((event) => event.durationMs as number),
        ),
      },
      boundaries: {
        containsUserIdentifiers: false,
        containsTokens: false,
        containsPasswords: false,
        containsTwoFactorCodes: false,
        containsClinicalFreeText: false,
        containsPaymentCredentials: false,
        containsRawClientStackTraces: false,
        automaticBetaEvidenceApproval: false,
      },
      generatedAt: new Date(now).toISOString(),
    } as const;
  }

  private normalizeWindowHours(value: number) {
    if (
      !Number.isInteger(value) ||
      value < MIN_WINDOW_HOURS ||
      value > MAX_WINDOW_HOURS
    ) {
      return DEFAULT_WINDOW_HOURS;
    }
    return value;
  }

  private percent(numerator: number, denominator: number) {
    if (denominator === 0) return null;
    return Math.round((numerator / denominator) * 10_000) / 100;
  }

  private p95(values: number[]) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
    );
    return sorted[index];
  }
}
