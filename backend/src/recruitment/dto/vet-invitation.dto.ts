import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class SendVetInvitationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  expiresInHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  followUpInHours?: number;
}

export class VetInvitationTokenDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;
}
