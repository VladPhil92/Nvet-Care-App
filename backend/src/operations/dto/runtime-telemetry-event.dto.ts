import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const RUNTIME_TELEMETRY_EVENT_NAMES = [
  "APP_STARTED",
  "AUTH_LOGIN_SUCCESS",
  "AUTH_LOGIN_FAILURE",
  "SESSION_REFRESH_SUCCESS",
  "SESSION_REFRESH_FAILURE",
  "CTG_FEDERATION_STARTED",
  "CTG_FEDERATION_CALLBACK_RECEIVED",
  "CTG_FEDERATION_EXCHANGE_SUCCESS",
  "CTG_FEDERATION_EXCHANGE_FAILURE",
  "API_REQUEST_SUCCESS",
  "API_REQUEST_FAILURE",
  "UNHANDLED_JS_ERROR",
] as const;

export type RuntimeTelemetryEventName =
  (typeof RUNTIME_TELEMETRY_EVENT_NAMES)[number];

export class RuntimeTelemetryEventDto {
  @IsIn(RUNTIME_TELEMETRY_EVENT_NAMES)
  event!: RuntimeTelemetryEventName;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  durationMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9._+-]+$/)
  appVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_100_000_000)
  versionCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Z0-9_:-]+$/)
  outcomeCode?: string;
}
