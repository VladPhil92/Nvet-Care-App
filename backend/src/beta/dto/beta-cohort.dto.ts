import { IsEmail, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class InviteBetaCohortMemberDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RevokeBetaCohortMemberDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}
