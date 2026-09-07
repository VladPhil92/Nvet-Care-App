import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Explicit confirmation + re-authentication payload for destructive account
 * deletion. Local-password accounts must prove the current password; federated
 * CTG One accounts use the already-authenticated Nvet session and the typed
 * confirmation phrase because they may not have a local password at all.
 */
export class DeleteAccountDto {
  @IsString()
  @Equals("ELIMINAR MI CUENTA", {
    message: 'Escribe exactamente "ELIMINAR MI CUENTA" para confirmar',
  })
  confirmation: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(128)
  currentPassword?: string;

  @IsString()
  @IsOptional()
  @Length(6, 8, { message: "Código TOTP inválido" })
  @Matches(/^\d+$/, { message: "El código solo puede contener dígitos" })
  twoFactorCode?: string;
}

export class ExternalAccountDeletionRequestDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  @MaxLength(254)
  email: string;
}

export class ExternalAccountDeletionConfirmDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  @MaxLength(254)
  email: string;

  @IsString()
  @Matches(/^\d{10}\.[a-f0-9]{32}$/i, {
    message: "Código de verificación inválido",
  })
  verificationCode: string;
}
