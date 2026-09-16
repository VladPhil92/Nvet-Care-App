import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { VetTier } from "@prisma/client";

export class RequestMembershipChangeDto {
  @IsEnum(VetTier)
  tier: VetTier;
}

export class ResolveMembershipChangeDto {
  @IsOptional()
  @IsString()
  @Length(3, 500)
  note?: string;
}
