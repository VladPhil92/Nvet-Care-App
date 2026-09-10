import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export enum VetOutreachChannel {
  EMAIL = "EMAIL",
}

export enum VetOutreachConsentSource {
  DIRECT_OPT_IN = "DIRECT_OPT_IN",
  PARTNER_REFERRAL_WITH_PERMISSION = "PARTNER_REFERRAL_WITH_PERMISSION",
  EVENT_OR_CAMPAIGN_OPT_IN = "EVENT_OR_CAMPAIGN_OPT_IN",
  EXISTING_PROFESSIONAL_RELATIONSHIP = "EXISTING_PROFESSIONAL_RELATIONSHIP",
  OTHER_DOCUMENTED_PERMISSION = "OTHER_DOCUMENTED_PERMISSION",
}

export class GrantVetOutreachConsentDto {
  @IsEnum(VetOutreachChannel)
  channel: VetOutreachChannel = VetOutreachChannel.EMAIL;

  @IsEnum(VetOutreachConsentSource)
  source: VetOutreachConsentSource;

  @IsString()
  @MinLength(3)
  @MaxLength(250)
  evidenceReference: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  authorizationStatementVersion: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RevokeVetOutreachConsentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
