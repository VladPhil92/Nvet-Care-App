import {
  IsEnum,
  IsString,
  IsOptional,
  IsDateString,
  Length,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import {
  AppointmentStatus,
  PaymentMethod,
  TransactionStatus,
  VetTier,
} from "@prisma/client";

// ============================================================
// METRICS FILTERS
// ============================================================

export class MetricsFiltersDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

// ============================================================
// TRANSACTIONS LIST
// ============================================================

export class AdminTransactionFiltersDto {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  vetName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}

// ============================================================
// DISPUTE RESOLUTION
// ============================================================

export type DisputeResolution = "CONFIRM" | "REFUND" | "CANCEL";

export class ResolveDisputeDto {
  @IsString()
  @IsNotEmpty()
  resolution: DisputeResolution;

  @IsString()
  @IsNotEmpty()
  @Length(10, 1000)
  notes: string;
}

// ============================================================
// VET TIER MANAGEMENT
// ============================================================

export class UpdateVetTierDto {
  @IsEnum(VetTier)
  tier: VetTier;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

// ============================================================
// EXPORTS
// ============================================================

export type ExportFormat = "CSV" | "XLSX";

export class ExportFiltersDto {
  @IsString()
  @IsNotEmpty()
  format: ExportFormat;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}

// ============================================================
// VET LIST FILTERS
// ============================================================

export class AdminVetsFiltersDto {
  @IsOptional()
  @IsEnum(VetTier)
  tier?: VetTier;

  @IsOptional()
  @IsString()
  verificationStatus?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}

// ============================================================
// APPOINTMENT FILTERS
// ============================================================

export class AdminAppointmentsFiltersDto {
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}
