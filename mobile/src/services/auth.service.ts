import { apiClient } from './api'
import {
  secureStorage,
  profileCache,
  purgeLegacyPlaintextSession,
  type CachedProfile,
} from '../lib/secureStorage'

export interface LoginCredentials {
  email: string
  password: string
  twoFactorCode?: string
  deviceLabel?: string
}

export interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  role: 'CLIENT' | 'VET'
}

export interface AuthUser {
  id: string
  email: string
  role: 'CLIENT' | 'VET' | 'ADMIN' | 'SUPERADMIN'
  firstName?: string
  lastName?: string
  phone?: string
  avatar?: string
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

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
  requiresEmailVerification?: boolean
  remainingRecoveryCodes?: number
  warning?: string | null
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

    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', credentials)
      await this.persistSession(response.data)
      return response.data
    } catch (error: any) {
      if (error?.response?.data?.error === 'TWO_FACTOR_REQUIRED') {
        throw new TwoFactorRequiredError(credentials.email, credentials.password)
      }
      throw error
    }
  }

  async loginWithRecoveryCode(payload: {
    email: string
    password: string
    recoveryCode: string
  }): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login/recovery', payload)
    await this.persistSession(response.data)
    return response.data
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

  async refreshToken(): Promise<string> {
    const refreshToken = await secureStorage.getRefreshToken()
    if (!refreshToken) throw new Error('No refresh token available')

    const response = await apiClient.post<{
      accessToken: string
      refreshToken: string
    }>('/auth/refresh', { refreshToken })

    await secureStorage.setTokens(response.data)
    return response.data.accessToken
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

  async startTwoFactorEnrollment(): Promise<{
    secret: string
    otpauthUrl: string
    encryptedSecret: string
  }> {
    const response = await apiClient.post('/auth/2fa/enroll')
    return response.data
  }

  async confirmTwoFactorEnrollment(
    encryptedSecret: string,
    code: string,
  ): Promise<{ recoveryCodes: string[]; message: string }> {
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

  async getActiveSessions(): Promise<unknown[]> {
    const response = await apiClient.get('/auth/sessions')
    return response.data
  }

  async revokeSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/auth/sessions/${sessionId}`)
  }
}

export const authService = new AuthService()
export default authService
