import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export const VET_RECRUITMENT_STAGES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "INVITED",
  "LOST",
] as const;

export type VetRecruitmentStage = (typeof VET_RECRUITMENT_STAGES)[number];

export class CreateVetRecruitmentLeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/)
  phone?: string;

  @IsString()
  @Matches(/^\d{5}$/)
  marketDaneCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsISO8601()
  nextFollowUpAt?: string;
}

export class UpdateVetRecruitmentStageDto {
  @IsIn(VET_RECRUITMENT_STAGES)
  stage: VetRecruitmentStage;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  nextFollowUpAt?: string | null;
}

export class ScheduleVetRecruitmentFollowUpDto {
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  nextFollowUpAt: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
