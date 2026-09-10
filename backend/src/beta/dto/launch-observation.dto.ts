import { IsString, Length, Matches } from "class-validator";

const NON_BLANK = /\S/;

export class StartLaunchObservationDto {
  @IsString()
  @Length(3, 500)
  @Matches(NON_BLANK)
  reason: string;
}

export class CloseLaunchObservationDto {
  @IsString()
  @Length(3, 500)
  @Matches(NON_BLANK)
  reason: string;
}

export class AbortLaunchObservationDto {
  @IsString()
  @Length(3, 500)
  @Matches(NON_BLANK)
  reason: string;

  @IsString()
  @Length(1, 120)
  @Matches(NON_BLANK)
  incidentReference: string;
}
