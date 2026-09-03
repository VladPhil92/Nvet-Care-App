import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class AuthorizeBetaActivationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  durationHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RevokeBetaActivationDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}
