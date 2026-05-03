/**
 * AuthService v2 — alineado con el backend production-grade.
 *
 * Endpoints cubiertos (18):
 *   - register, login, login-recovery, refresh, logout, logout-all
 *   - forgot-password, reset-password, change-password
 *   - 2fa/enroll, 2fa/confirm, 2fa/disable
 *   - send-verification-email, verify-email
 *   - me, sessions (list + revoke + revoke-all)
 *
 * Manejo especial:
 *   - login con 2FA: si el backend retorna 401 + error TWO_FACTOR_REQUIRED,
 *     se lanza una excepción tipada que el cliente puede catchear para
 *     navegar al screen de verify TOTP.
 *   - tokens se persisten en SecureStorage (keychain), no en AsyncStorage.
 *   - errores se normalizan a mensajes legibles con `getErrorMessage()`.
 */

import api, { getErrorMessage } from './api'
import { secureStorage, profileCache } from '../lib/secureStorage'

// =====================================================================
// TYPES
// =====================================================================

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  avatar?: string | null
  role: 'CLIENT' | 'VET' | 'ADMIN'
  emailVerified: boolean
  twoFactorEnabled: boolean
  vetProfile?: any
}

export interface LoginResponse {
  user: User
  accessToken: string
  refreshToken: string
  requiresEmailVerification: boolean
  remainingRecoveryCodes?: number
  warning?: string | null
}

export interface RegisterPayload {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  role?: 'CLIENT' | 'VET'
}

export interface LoginPayload {
  email: string
  password: string
  twoFactorCode?: string
  deviceLabel?: string
}

export interface TwoFactorEnrollResponse {
  secret: string
  otpauthUrl: string
  encryptedSecret: string
}

export interface TwoFactorConfirmResponse {
  recoveryCodes: string[]
  message: string
}

export interface ActiveSession {
  id: string
  userAgent: string | null
  ipAddress: string | null
  deviceLabel: string | null
  lastUsedAt: string
  createdAt: string
  expiresAt: string
}

/**
 * Error tipado que se lanza cuando el login requiere TOTP.
 * El UI puede catchear con `instanceof TwoFactorRequiredError`.
 */
export class TwoFactorRequiredError extends Error {
  readonly email: string
  readonly password: string

  constructor(email: string, password: string) {
    super('Se requiere código del autenticador')
    this.name = 'TwoFactorRequiredError'
    this.email = email
    this.password = password
  }
}

// =====================================================================
// SERVICE
// =====================================================================

export const authService = {
  // ────────────────────────────────────────────────
  // REGISTER + LOGIN
  // ────────────────────────────────────────────────

  async register(payload: RegisterPayload): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/register', payload)
    await this.persistSession(data)
    return data
  },

  async login(payload: LoginPayload): Promise<LoginResponse> {
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', payload)
      await this.persistSession(data)
      return data
    } catch (error: any) {
      // Backend indica 2FA requerido con error específico
      const errBody = error?.response?.data
      if (errBody?.error === 'TWO_FACTOR_REQUIRED') {
        throw new TwoFactorRequiredError(payload.email, payload.password)
      }
      throw error
    }
  },

  async loginWithRecoveryCode(payload: {
    email: string
    password: string
    recoveryCode: string
  }): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/login/recovery', payload)
    await this.persistSession(data)
    return data
  },

  // ────────────────────────────────────────────────
  // TOKEN + LOGOUT
  // ────────────────────────────────────────────────

  async refresh(): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshToken = await secureStorage.getRefreshToken()
    if (!refreshToken) throw new Error('No hay refresh token')
    const { data } = await api.post('/auth/refresh', { refreshToken })
    await secureStorage.setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    })
    return data
  },

  async logout(): Promise<void> {
    const refreshToken = await secureStorage.getRefreshToken()
    try {
      await api.post('/auth/logout', refreshToken ? { refreshToken } : {})
    } catch {
      // Ignorar errores: el logout local debe ocurrir incluso si la red falla
    }
    await this.clearSession()
  },

  async logoutAllDevices(): Promise<{ revoked: number }> {
    const { data } = await api.post('/auth/logout-all')
    await this.clearSession()
    return data
  },

  // ────────────────────────────────────────────────
  // PASSWORD: forgot / reset / change
  // ────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    const { data } = await api.post('/auth/forgot-password', { email })
    return data
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const { data } = await api.post('/auth/reset-password', { token, newPassword })
    return data
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const { data } = await api.post('/auth/change-password', {
      currentPassword,
      newPassword,
    })
    // Backend invalidó todas las sesiones → forzar logout local
    await this.clearSession()
    return data
  },

  // ────────────────────────────────────────────────
  // 2FA
  // ────────────────────────────────────────────────

  async startTwoFactorEnrollment(): Promise<TwoFactorEnrollResponse> {
    const { data } = await api.post('/auth/2fa/enroll')
    return data
  },

  async confirmTwoFactorEnrollment(
    encryptedSecret: string,
    code: string,
  ): Promise<TwoFactorConfirmResponse> {
    const { data } = await api.post('/auth/2fa/confirm', { encryptedSecret, code })
    return data
  },

  async disableTwoFactor(password: string, code: string): Promise<void> {
    await api.post('/auth/2fa/disable', { password, code })
  },

  // ────────────────────────────────────────────────
  // EMAIL VERIFICATION
  // ────────────────────────────────────────────────

  /**
   * Solicita un nuevo email de verificación. Requiere autenticación.
   * El backend rate-limita a 3 emails / 15min por IP.
   */
  async sendVerificationEmail(): Promise<{
    message: string
    expiresInHours: number
  }> {
    const { data } = await api.post('/auth/send-verification-email')
    return data
  },

  /**
   * Activa la cuenta consumiendo el token recibido por email.
   * Endpoint público — el token (recibido del deep link) garantiza ownership.
   */
  async verifyEmail(token: string): Promise<{
    message: string
    emailVerified: boolean
  }> {
    const { data } = await api.post('/auth/verify-email', { token })
    return data
  },

  // ────────────────────────────────────────────────
  // CURRENT USER + SESSIONS
  // ────────────────────────────────────────────────

  async me(): Promise<User> {
    const { data } = await api.get<User>('/auth/me')
    await profileCache.set({
      id: data.id,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      avatar: data.avatar,
    })
    return data
  },

  async listSessions(): Promise<ActiveSession[]> {
    const { data } = await api.get<ActiveSession[]>('/auth/sessions')
    return data
  },

  async revokeSession(sessionId: string): Promise<void> {
    await api.delete(`/auth/sessions/${sessionId}`)
  },

  // ────────────────────────────────────────────────
  // INTERNAL
  // ────────────────────────────────────────────────

  async persistSession(response: LoginResponse): Promise<void> {
    await secureStorage.setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    })
    await profileCache.set({
      id: response.user.id,
      email: response.user.email,
      firstName: response.user.firstName,
      lastName: response.user.lastName,
      avatar: response.user.avatar,
    })
  },

  async clearSession(): Promise<void> {
    await secureStorage.clearTokens()
    await profileCache.clear()
  },

  async hasActiveSession(): Promise<boolean> {
    const tokens = await secureStorage.getTokens()
    return tokens !== null
  },

  /** Helper para extraer mensaje legible de cualquier error */
  getErrorMessage,
}

export default authService
