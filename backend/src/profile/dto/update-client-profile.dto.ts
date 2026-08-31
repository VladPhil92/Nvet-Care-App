import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

const NAME_REGEX = /^[\p{L}\s'-]+$/u;
const PHONE_OR_EMPTY_REGEX = /^(?:|\+?[1-9]\d{7,14})$/;

/**
 * Mutable Nvet-local profile attributes.
 *
 * Identity and authority fields such as email, userId, ctgUserId and role are
 * intentionally absent. The global ValidationPipe forbids non-whitelisted
 * properties, so callers cannot smuggle identity/authorization changes into
 * this endpoint.
 */
export class UpdateClientProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_REGEX, {
    message:
      "El nombre solo puede contener letras, espacios, guiones y apóstrofes",
  })
  firstName?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_REGEX, {
    message:
      "El apellido solo puede contener letras, espacios, guiones y apóstrofes",
  })
  lastName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(16)
  @Matches(PHONE_OR_EMPTY_REGEX, {
    message: "Teléfono inválido (formato E.164: +57XXXXXXXXXX)",
  })
  phone?: string;
}
