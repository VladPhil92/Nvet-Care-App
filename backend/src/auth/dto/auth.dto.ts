import {
  IsEmail,
  IsString,
  IsOptional,
  IsIn,
  Matches,
  MinLength,
  MaxLength,
  Length,
  IsBoolean,
} from "class-validator";
import { UserRole } from "@prisma/client";

const SELF_REGISTERABLE_ROLES = [UserRole.CLIENT, UserRole.VET] as const;

const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]).{12,128}$/;

const STRONG_PASSWORD_MESSAGE =
  "La contraseña debe tener mínimo 12 caracteres con al menos una mayúscula, una minúscula, un dígito y un símbolo especial";

const NAME_REGEX = /^[\p{L}\s'-]+$/u;
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

export class RegisterDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(12, { message: STRONG_PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_REGEX, {
    message:
      "El nombre solo puede contener letras, espacios, guiones y apóstrofes",
  })
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(NAME_REGEX, {
    message:
      "El apellido solo puede contener letras, espacios, guiones y apóstrofes",
  })
  lastName: string;

  @IsString()
  @IsOptional()
  @Matches(PHONE_REGEX, {
    message: "Teléfono inválido (formato E.164: +57XXXXXXXXXX)",
  })
  phone?: string;

  @IsIn(SELF_REGISTERABLE_ROLES, { message: "Rol inválido" })
  @IsOptional()
  role?: UserRole = UserRole.CLIENT;
}

export class LoginDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1, { message: "Contraseña requerida" })
  @MaxLength(128)
  password: string;

  @IsString()
  @IsOptional()
  @Length(6, 8, {
    message: "El código del autenticador debe tener entre 6 y 8 dígitos",
  })
  twoFactorCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceLabel?: string;
}

export class CtgIdentityExchangeDto {
  @IsString()
  @MinLength(20, { message: "Token de sesión CTG One inválido" })
  @MaxLength(4096)
  supabaseAccessToken: string;

  @IsString()
  @IsOptional()
  @Length(6, 8, {
    message: "El código del autenticador debe tener entre 6 y 8 dígitos",
  })
  twoFactorCode?: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(12, { message: STRONG_PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: "Contraseña actual requerida" })
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(12, { message: STRONG_PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  newPassword: string;
}

export class TwoFactorEnableDto {
  @IsString()
  @Length(6, 8, { message: "Código TOTP inválido (6-8 dígitos)" })
  @Matches(/^\d+$/, { message: "El código solo puede contener dígitos" })
  code: string;
}

export class TwoFactorDisableDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @IsString()
  @Length(6, 8, { message: "Código TOTP inválido" })
  @Matches(/^\d+$/, { message: "El código solo puede contener dígitos" })
  code: string;
}

export class TwoFactorRecoveryDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @IsString()
  @Length(10, 12, { message: "Código de recuperación inválido" })
  recoveryCode: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}

/**
 * Native clients submit refreshToken in the body. Browser dashboards use an
 * HttpOnly refresh cookie, so the DTO must accept an empty body while the
 * controller still fails closed when neither source exists.
 */
export class RefreshTokenDto {
  @IsString()
  @IsOptional()
  @MinLength(20)
  @MaxLength(2000)
  refreshToken?: string;
}

export class RevokeSessionDto {
  @IsString()
  @MinLength(1)
  sessionId: string;

  @IsBoolean()
  @IsOptional()
  revokeAll?: boolean;
}
