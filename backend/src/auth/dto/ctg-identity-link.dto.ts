import { IsString, MaxLength, MinLength } from "class-validator";

/**
 * Proof of the CTG One identity that will be linked to the already
 * authenticated Nvet account. The Nvet user id, email and role are never
 * accepted from the caller; they come from the authenticated Nvet session
 * and the verified Supabase token respectively.
 */
export class CtgIdentityLinkDto {
  @IsString()
  @MinLength(20, { message: "Token de sesión CTG One inválido" })
  @MaxLength(4096)
  supabaseAccessToken: string;
}
