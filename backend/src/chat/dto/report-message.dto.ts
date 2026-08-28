import { IsEnum, IsString, IsOptional, MaxLength } from "class-validator";

export enum ReportReason {
  ABUSIVE_PRICING = "ABUSIVE_PRICING",
  INAPPROPRIATE = "INAPPROPRIATE",
  SPAM = "SPAM",
  OTHER = "OTHER",
}

export class ReportMessageDto {
  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  details?: string;
}
