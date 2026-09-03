import { IsBoolean, IsIn } from "class-validator";
import {
  BETA_PRIVACY_VERSION,
  BETA_TERMS_VERSION,
} from "../beta-legal.constants";

export class AcceptBetaLegalDto {
  @IsBoolean()
  accepted: boolean;

  @IsIn([BETA_TERMS_VERSION])
  termsVersion: string;

  @IsIn([BETA_PRIVACY_VERSION])
  privacyVersion: string;
}
