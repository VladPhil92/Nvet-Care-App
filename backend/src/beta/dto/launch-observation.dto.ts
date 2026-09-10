import { IsString, Length } from "class-validator";

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
  @Length(1, 120)
  incidentReference: string;
}
