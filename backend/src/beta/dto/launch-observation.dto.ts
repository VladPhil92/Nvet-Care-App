import { IsString, Length, MaxLength } from "class-validator";

export class StartLaunchObservationDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class CloseLaunchObservationDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class AbortLaunchObservationDto {
  @IsString()
  @Length(3, 500)
  reason: string;

  @IsString()
  @MaxLength(120)
  incidentReference: string;
}
