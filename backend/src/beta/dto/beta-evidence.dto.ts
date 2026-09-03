import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { BETA_EVIDENCE_GATES } from "../beta-evidence.constants";

export class SubmitBetaEvidenceDto {
  @IsIn(BETA_EVIDENCE_GATES)
  gate: string;

  @IsIn(["production", "staging"])
  environment: "production" | "staging";

  @IsString()
  @Length(3, 500)
  reference: string;

  @IsISO8601()
  observedAt: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DecideBetaEvidenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
