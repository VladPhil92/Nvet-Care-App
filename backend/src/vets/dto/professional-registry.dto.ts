import { IsEnum, IsString, Length } from "class-validator";

export enum ProfessionalRegistryCheckStatus {
  VERIFIED = "VERIFIED",
  NOT_FOUND = "NOT_FOUND",
  SANCTIONED = "SANCTIONED",
  UNAVAILABLE = "UNAVAILABLE",
}

export class RecordProfessionalRegistryCheckDto {
  @IsEnum(ProfessionalRegistryCheckStatus)
  status: ProfessionalRegistryCheckStatus;

  @IsString()
  @Length(10, 1000)
  evidence: string;
}
