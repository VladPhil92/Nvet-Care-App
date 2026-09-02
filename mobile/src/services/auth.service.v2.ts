/**
 * Transitional import facade.
 *
 * There is exactly one authentication runtime: ./auth.service. Historical UI
 * modules still importing `auth.service.v2` are redirected here without a
 * second implementation, state store, token path or HTTP client. New code must
 * import ./auth.service directly; the convergence gate enforces that this file
 * stays a pure re-export until the remaining UI imports are mechanically
 * renamed.
 */
export {
  default,
  authService,
  TwoFactorRequiredError,
} from './auth.service'

export type {
  ActiveSession,
  AuthResponse as LoginResponse,
  AuthUser as User,
  LoginPayload,
  RegisterPayload,
  TwoFactorConfirmResponse,
  TwoFactorEnrollResponse,
} from './auth.service'
