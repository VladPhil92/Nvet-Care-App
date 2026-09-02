import { IsIn, IsOptional, IsString, IsUUID, Length } from "class-validator";

export const CLIENT_AI_MODES = ["CARE_GUIDANCE", "PRE_VISIT"] as const;
export type ClientAiMode = (typeof CLIENT_AI_MODES)[number];

export const VET_AI_MODES = ["CASE_REVIEW", "DOCUMENTATION"] as const;
export type VetAiMode = (typeof VET_AI_MODES)[number];

export class ClientAiAssistDto {
  @IsUUID()
  petId: string;

  @IsString()
  @Length(3, 1500)
  question: string;

  @IsOptional()
  @IsIn(CLIENT_AI_MODES)
  mode?: ClientAiMode = "CARE_GUIDANCE";
}

export class VetAiAssistDto {
  @IsUUID()
  appointmentId: string;

  @IsString()
  @Length(3, 2000)
  question: string;

  @IsOptional()
  @IsIn(VET_AI_MODES)
  mode?: VetAiMode = "CASE_REVIEW";
}
