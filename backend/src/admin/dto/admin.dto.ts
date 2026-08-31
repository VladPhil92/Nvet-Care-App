import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import {
  AppointmentStatus,
  AuditAction,
  AuditSeverity,
  PaymentMethod,
  TransactionStatus,
  UserRole,
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

// ============================================================
// SUPERADMIN GOVERNANCE
// ============================================================

export class AdminUsersFiltersDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsIn(["true", "false"])
  isActive?: "true" | "false";

  @IsOptional()
  @IsString()
  @Length(2, 100)
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

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive: boolean;

  @IsString()
  @IsNotEmpty()
  @Length(10, 500)
  reason: string;
}

export type VetVerificationDecision = "APPROVE" | "REJECT" | "IN_REVIEW";

export class ReviewVetVerificationDto {
  @IsIn(["APPROVE", "REJECT", "IN_REVIEW"])
  decision: VetVerificationDecision;

  @IsString()
  @IsNotEmpty()
  @Length(10, 500)
  reason: string;
}

export class UpdateVetStatusDto {
  @IsBoolean()
  isActive: boolean;

  @IsString()
  @IsNotEmpty()
  @Length(10, 500)
  reason: string;
}

export class AuditLogFiltersDto {
  @IsOptional()
  @IsEnum(AuditSeverity)
  severity?: AuditSeverity;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  targetType?: string;

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
