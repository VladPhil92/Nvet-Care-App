import {
  Equals,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class ConfigureBetaSupportDto {
  @IsString()
  @Length(3, 120)
  ownerRole: string;

  @IsString()
  @Length(3, 200)
  channelReference: string;

  @IsBoolean()
  @Equals(true)
  monitoringConfirmed: boolean;

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

export class RevokeBetaSupportDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}
