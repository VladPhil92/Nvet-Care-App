import { apiClient, getErrorMessage } from './api'
import {
  secureStorage,
  profileCache,
  purgeLegacyPlaintextSession,
  type CachedProfile,
} from '../lib/secureStorage'
import runtimeTelemetry from './runtime-telemetry.service'

export interface LoginCredentials {
  email: string
  password: string
  twoFactorCode?: string
  deviceLabel?: string
}

export type LoginPayload = LoginCredentials

export interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  role: 'CLIENT' | 'VET'
}

export type RegisterPayload = RegisterData

export interface AuthUser {
  id: string
  email: string
  role: 'CLIENT' | 'VET' | 'ADMIN' | 'SUPERADMIN'
  firstName?: string
  lastName?: string
  phone?: string
  avatar?: string | null
  emailVerified?: boolean
  twoFactorEnabled?: boolean
  vetProfile?: {
    id: string
    licenseNumber?: string
    specialties?: string[]
    tier: 'FREE' | 'PRO' | 'ELITE'
    ctgBalance?: number
    rating?: number
    isVerified: boolean
    verificationStatus?: 'NONE' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
  }
}

export type User = AuthUser

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
  requiresEmailVerification?: boolean
  remainingRecoveryCodes?: number
  warning?: string | null
}

export type LoginResponse = AuthResponse

export interface CtgIdentityLinkResponse {
  linked: true
  userId: string
  email: string
  role: AuthUser['role']
  ctgUserId: string
  rolePreserved: true
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

export interface AccountDeletionBlocker {
  code:
    | 'ACTIVE_APPOINTMENTS'
    | 'UNRESOLVED_TRANSACTIONS'
    | 'WALLET_BALANCE'
    | 'OPEN_WITHDRAWALS'
    | 'ADMIN_ACCOUNT'
  message: string
  count?: number
}

export interface AccountDeletionReadiness {
  canDelete: boolean
  reauthMethod: 'PASSWORD' | 'SESSION'
  twoFactorRequired: boolean
  blockers: AccountDeletionBlocker[]
  confirmationPhrase: 'ELIMINAR MI CUENTA'
  retainedCategories: string[]
  erasedCategories: string[]
}

export interface DeleteAccountPayload {
  confirmation: 'ELIMINAR MI CUENTA'
  currentPassword?: string
  twoFactorCode?: string
}

export interface DeleteAccountResponse {
  deleted: true
  deletedAt: string
  message: string
}

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

function authOutcomeCode(error: any): string {
  if (typeof error?.response?.data?.error === 'string') {
    return error.response.data.error
  }
  if (typeof error?.response?.status === 'number') {
    return `HTTP_${error.response.status}`
  }
  return 'AUTH_FAILED'
}

class AuthService {
  private legacyPurged = false

  private async ensureLegacySessionPurged(): Promise<void> {
    if (this.legacyPurged) return
    await purgeLegacyPlaintextSession()
    this.legacyPurged = true
  }

  private async persistSession(data: AuthResponse): Promise<void> {
    if (!data.accessToken || !data.refreshToken) {
      throw new Error('El servidor no devolvió una sesión completa')
    }

    await this.ensureLegacySessionPurged()
    await secureStorage.setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    })
    await profileCache.set(data.user as CachedProfile)
    void runtimeTelemetry.flush()
  }

  private async clearSession(): Promise<void> {
    await Promise.all([
      secureStorage.clearTokens().catch(() => undefined),
      profileCache.clear(),
      purgeLegacyPlaintextSession(),
    ])
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse>
  async login(email: string, password: string): Promise<AuthResponse>
  async login(
    credentialsOrEmail: LoginCredentials | string,
    password?: string,
  ): Promise<AuthResponse> {
    const credentials =
      typeof credentialsOrEmail === 'string'
        ? { email: credentialsOrEmail, password: password ?? '' }
        : credentialsOrEmail
    const startedAt = Date.now()

    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', credentials)
      await this.persistSession(response.data)
      runtimeTelemetry.emit('AUTH_LOGIN_SUCCESS', {
        durationMs: Date.now() - startedAt,
      })
      return response.data
    } catch (error: any) {
      if (error?.response?.data?.error === 'TWO_FACTOR_REQUIRED') {
        throw new TwoFactorRequiredError(credentials.email, credentials.password)
      }
      runtimeTelemetry.emit('AUTH_LOGIN_FAILURE', {
        durationMs: Date.now() - startedAt,
        outcomeCode: authOutcomeCode(error),
      })
      throw error
    }
  }

  /**
   * Exchange a CTG One Supabase session for a normal Nvet session. The backend
   * verifies the Supabase JWT and remains the only authority for the Nvet role.
   * This method is retained for trusted server/native bridges; browser handoff
   * must never place the Supabase bearer token in a deep link.
   */
  async loginWithCtgIdentity(
    supabaseAccessToken: string,
    twoFactorCode?: string,
  ): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/ctg-identity-exchange', {
      supabaseAccessToken,
      ...(twoFactorCode ? { twoFactorCode } : {}),
    })
    await this.persistSession(response.data)
    return response.data
  }

  /**
   * Persist a session that was returned by the trusted CTG One mobile PKCE
   * exchange. This keeps all login modes on the same secure-storage path.
   */
  async acceptFederatedSession(data: AuthResponse): Promise<AuthResponse> {
    await this.persistSession(data)
    return data
  }

  /**
   * Link an already authenticated Nvet account to the CTG One identity proven
   * by the supplied Supabase token. This endpoint never changes the Nvet role.
   */
  async linkCtgIdentity(supabaseAccessToken: string): Promise<CtgIdentityLinkResponse> {
    const response = await apiClient.post<CtgIdentityLinkResponse>('/auth/ctg-identity/link', {
      supabaseAccessToken,
    })
    return response.data
  }

  async loginWithRecoveryCode(payload: {
    email: string
    password: string
    recoveryCode: string
  }): Promise<AuthResponse> {
    const startedAt = Date.now()
    try {
      const response = await apiClient.post<AuthResponse>('/auth/login/recovery', payload)
      await this.persistSession(response.data)
      runtimeTelemetry.emit('AUTH_LOGIN_SUCCESS', {
        durationMs: Date.now() - startedAt,
        outcomeCode: 'RECOVERY_CODE',
      })
      return response.data
    } catch (error) {
      runtimeTelemetry.emit('AUTH_LOGIN_FAILURE', {
        durationMs: Date.now() - startedAt,
        outcomeCode: authOutcomeCode(error),
      })
      throw error
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data)
    await this.persistSession(response.data)
    return response.data
  }

  async logout(): Promise<void> {
    const refreshToken = await secureStorage.getRefreshToken().catch(() => null)
    try {
      await apiClient.post('/auth/logout', refreshToken ? { refreshToken } : {})
    } finally {
      await this.clearSession()
    }
  }

  async logoutAllDevices(): Promise<{ revoked: number }> {
    const response = await apiClient.post<{ revoked: number }>('/auth/logout-all')
    await this.clearSession()
    return response.data
  }

  async getAccountDeletionReadiness(): Promise<AccountDeletionReadiness> {
    const response = await apiClient.get<AccountDeletionReadiness>(
      '/auth/account/deletion-readiness',
    )
    return response.data
  }

  async deleteAccount(payload: DeleteAccountPayload): Promise<DeleteAccountResponse> {
    const response = await apiClient.delete<DeleteAccountResponse>('/auth/account', {
      data: payload,
    })
    await this.clearSession()
    return response.data
  }

  async refresh(): Promise<{ accessToken: string; refreshToken: string }> {
    const startedAt = Date.now()
    try {
      const refreshToken = await secureStorage.getRefreshToken()
      if (!refreshToken) throw new Error('No refresh token available')

      const response = await apiClient.post<{
        accessToken: string
        refreshToken: string
      }>('/auth/refresh', { refreshToken })

      await secureStorage.setTokens(response.data)
      runtimeTelemetry.emit('SESSION_REFRESH_SUCCESS', {
        durationMs: Date.now() - startedAt,
      })
      return response.data
    } catch (error) {
      runtimeTelemetry.emit('SESSION_REFRESH_FAILURE', {
        durationMs: Date.now() - startedAt,
        outcomeCode: authOutcomeCode(error),
      })
      throw error
    }
  }

  async refreshToken(): Promise<string> {
    return (await this.refresh()).accessToken
  }

  async me(): Promise<AuthUser> {
    const response = await apiClient.get<AuthUser>('/auth/me')
    await profileCache.set(response.data as CachedProfile)
    return response.data
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    await this.ensureLegacySessionPurged()
    const profile = await profileCache.get()
    return profile as AuthUser | null
  }

  async getAccessToken(): Promise<string | null> {
    await this.ensureLegacySessionPurged()
    return secureStorage.getAccessToken()
  }

  async isAuthenticated(): Promise<boolean> {
    return Boolean(await this.getAccessToken())
  }

  async hasActiveSession(): Promise<boolean> {
    await this.ensureLegacySessionPurged()
    return (await secureStorage.getTokens()) !== null
  }

  async updateUserData(userData: Partial<AuthUser>): Promise<void> {
    const currentUser = await this.getCurrentUser()
    if (currentUser) {
      await profileCache.set({ ...currentUser, ...userData } as CachedProfile)
    }
  }

  async updateProfile(data: {
    firstName?: string
    lastName?: string
    phone?: string
    avatar?: string
  }): Promise<AuthUser> {
    const response = await apiClient.patch<AuthUser>('/users/me', data)
    await this.updateUserData(response.data)
    return response.data
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await apiClient.post('/auth/forgot-password', { email })
    return response.data
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const response = await apiClient.post('/auth/reset-password', { token, newPassword })
    return response.data
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const response = await apiClient.post('/auth/change-password', {
      currentPassword,
      newPassword,
    })
    await this.clearSession()
    return response.data
  }

  async startTwoFactorEnrollment(): Promise<TwoFactorEnrollResponse> {
    const response = await apiClient.post('/auth/2fa/enroll')
    return response.data
  }

  async confirmTwoFactorEnrollment(
    encryptedSecret: string,
    code: string,
  ): Promise<TwoFactorConfirmResponse> {
    const response = await apiClient.post('/auth/2fa/confirm', {
      encryptedSecret,
      code,
    })
    return response.data
  }

  async disableTwoFactor(password: string, code: string): Promise<void> {
    await apiClient.post('/auth/2fa/disable', { password, code })
  }

  async sendVerificationEmail(): Promise<{
    message: string
    expiresInHours: number
  }> {
    const response = await apiClient.post('/auth/send-verification-email')
    return response.data
  }

  async verifyEmail(token: string): Promise<{
    message: string
    emailVerified: boolean
  }> {
    const response = await apiClient.post('/auth/verify-email', { token })
    return response.data
  }

  async listSessions(): Promise<ActiveSession[]> {
    const response = await apiClient.get<ActiveSession[]>('/auth/sessions')
    return response.data
  }

  async getActiveSessions(): Promise<ActiveSession[]> {
    return this.listSessions()
  }

  async revokeSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/auth/sessions/${sessionId}`)
  }

  getErrorMessage(error: unknown): string {
    return getErrorMessage(error)
  }
}

export const authService = new AuthService()
export default authService
