import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export enum AllergySeverity {
  MILD = "MILD",
  MODERATE = "MODERATE",
  SEVERE = "SEVERE",
}

export enum ConditionStatus {
  ACTIVE = "ACTIVE",
  RESOLVED = "RESOLVED",
  UNKNOWN = "UNKNOWN",
}

export enum PreventiveCareType {
  CHECKUP = "CHECKUP",
  VACCINATION = "VACCINATION",
  DEWORMING = "DEWORMING",
  DENTAL = "DENTAL",
  LAB = "LAB",
  OTHER = "OTHER",
}

export enum PreventiveCareStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

class HealthProfileItem {
  @IsUUID()
  id: string;
}

export class AllergyItemDto extends HealthProfileItem {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  substance: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  reaction?: string;

  @IsEnum(AllergySeverity)
  severity: AllergySeverity;

  @IsDateString()
  @IsOptional()
  notedAt?: string;
}

export class MedicationItemDto extends HealthProfileItem {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  dosage?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  frequency?: string;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  endedAt?: string;

  @IsBoolean()
  active: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;
}

export class ConditionItemDto extends HealthProfileItem {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsDateString()
  @IsOptional()
  diagnosedAt?: string;

  @IsEnum(ConditionStatus)
  status: ConditionStatus;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;
}

export class VaccinationItemDto extends HealthProfileItem {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  vaccine: string;

  @IsDateString()
  administeredAt: string;

  @IsDateString()
  @IsOptional()
  nextDueAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  batch?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  provider?: string;
}

export class DewormingItemDto extends HealthProfileItem {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  product: string;

  @IsDateString()
  administeredAt: string;

  @IsDateString()
  @IsOptional()
  nextDueAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;
}

export class PreventiveCareItemDto extends HealthProfileItem {
  @IsEnum(PreventiveCareType)
  type: PreventiveCareType;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsDateString()
  dueAt: string;

  @IsEnum(PreventiveCareStatus)
  status: PreventiveCareStatus;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;
}

/**
 * Owner-reported preventive profile V1.
 *
 * This document is deliberately separate from veterinarian-authored
 * diagnosis/treatment stored on Appointment. Replacing the document is an
 * owner-only operation and the backend owns the persisted schema version.
 */
export class UpdatePetHealthProfileDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AllergyItemDto)
  allergies: AllergyItemDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications: MedicationItemDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConditionItemDto)
  conditions: ConditionItemDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VaccinationItemDto)
  vaccinations: VaccinationItemDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DewormingItemDto)
  deworming: DewormingItemDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PreventiveCareItemDto)
  preventiveCare: PreventiveCareItemDto[];
}