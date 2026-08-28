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

// Only these roles are self-assignable at public registration. ADMIN must
// never be reachable through this DTO — it's provisioned out-of-band
// (direct DB) — so it's deliberately excluded here rather than validated
// with @IsEnum(UserRole), which would accept it.
const SELF_REGISTERABLE_ROLES = [UserRole.CLIENT, UserRole.VET] as const;

/**
 * Regex de password fuerte:
 *  - 12+ caracteres (mejora sobre NIST SP 800-63B mínimo 8)
 *  - Al menos 1 mayúscula
 *  - Al menos 1 minúscula
 *  - Al menos 1 dígito
 *  - Al menos 1 símbolo especial
 *  - Máximo 128 chars (anti-DOS por hashing largo)
 *
 * Validación anti-common-passwords y diversidad por trigrams se hace
 * en `PasswordService.validateStrength()` para evitar 1000 iteraciones
 * de regex aquí.
 */
const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]).{12,128}$/;

const STRONG_PASSWORD_MESSAGE =
  "La contraseña debe tener mínimo 12 caracteres con al menos una mayúscula, una minúscula, un dígito y un símbolo especial";

const NAME_REGEX = /^[\p{L}\s'-]+$/u;
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

// ============================================================
// REGISTER
// ============================================================

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

// ============================================================
// LOGIN
// ============================================================

export class LoginDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1, { message: "Contraseña requerida" })
  @MaxLength(128)
  password: string;

  /**
   * Código TOTP de 6 dígitos del autenticador (si el usuario tiene 2FA habilitado).
   * Si está vacío y el usuario tiene 2FA activo, el endpoint retorna 401 con
   * `error: 'TWO_FACTOR_REQUIRED'` para que el cliente muestre el screen de TOTP.
   */
  @IsString()
  @IsOptional()
  @Length(6, 8, {
    message: "El código del autenticador debe tener entre 6 y 8 dígitos",
  })
  twoFactorCode?: string;

  /**
   * Etiqueta opcional del dispositivo para mostrar al usuario en sus sesiones activas
   * (e.g. "iPhone de Carlos", "Chrome en Windows").
   */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceLabel?: string;
}

// ============================================================
// CTG ONE IDENTITY EXCHANGE
// ============================================================
// See docs/identity/ADR-001-unified-identity-for-nvet-care.md and
// THREAT_MODEL.md in ctg_one_website. Called only server-to-server
// (Next.js BFF or a native app holding its own Supabase session) —
// never a bare fetch from a browser tab.

export class CtgIdentityExchangeDto {
  @IsString()
  @MinLength(20, { message: "Token de sesión CTG One inválido" })
  @MaxLength(4096)
  supabaseAccessToken: string;

  /**
   * Código TOTP opcional, para completar el desafío 2FA en la misma
   * llamada cuando el `User` vinculado ya tiene 2FA habilitado —
   * mismo contrato que `LoginDto.twoFactorCode`.
   */
  @IsString()
  @IsOptional()
  @Length(6, 8, {
    message: "El código del autenticador debe tener entre 6 y 8 dígitos",
  })
  twoFactorCode?: string;
}

// ============================================================
// FORGOT PASSWORD
// ============================================================

export class ForgotPasswordDto {
  @IsEmail({}, { message: "Correo electrónico inválido" })
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  /**
   * Token recibido por email (64 hex chars del random + ID separado por dot).
   * Formato: <userId>.<rawToken>
   */
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

// ============================================================
// CHANGE PASSWORD (autenticado)
// ============================================================

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

// ============================================================
// 2FA — Enroll y Verify
// ============================================================

/**
 * Body para confirmar el enrolamiento de 2FA tras escanear el QR
 * en Google Authenticator (o app compatible TOTP).
 * El usuario debe ingresar 1 código TOTP válido para confirmar
 * que el QR fue escaneado correctamente.
 */
export class TwoFactorEnableDto {
  @IsString()
  @Length(6, 8, { message: "Código TOTP inválido (6-8 dígitos)" })
  @Matches(/^\d+$/, { message: "El código solo puede contener dígitos" })
  code: string;
}

/**
 * Body para deshabilitar 2FA (requiere password + código TOTP actual).
 */
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

/**
 * Body para verificar 2FA con código de recuperación (en caso de
 * pérdida del autenticador).
 */
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

// ============================================================
// EMAIL VERIFICATION
// ============================================================

export class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}

// ============================================================
// REFRESH TOKEN
// ============================================================

export class RefreshTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  refreshToken: string;
}

// ============================================================
// REVOKE SESSION
// ============================================================

export class RevokeSessionDto {
  @IsString()
  @MinLength(1)
  sessionId: string;

  @IsBoolean()
  @IsOptional()
  revokeAll?: boolean;
}
