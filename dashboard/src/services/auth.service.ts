import { apiClient, performTokenRefresh } from './api'
import { browserSession } from './session'

export interface LoginCredentials {
  email: string
  password: string
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
  role: string
  firstName?: string
  lastName?: string
}

export interface AuthResponse {
  accessToken: string
  user: AuthUser
}

class AuthService {
  private currentUser: AuthUser | null = null

  private acceptSession(response: AuthResponse): AuthResponse {
    if (!response.accessToken) {
      throw new Error('El servidor no devolvió un access token')
    }
    browserSession.setAccessToken(response.accessToken)
    this.currentUser = response.user
    return response
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

    const response = await apiClient.post<AuthResponse>('/auth/login', credentials)
    return this.acceptSession(response.data)
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data)
    return this.acceptSession(response.data)
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', {})
    } finally {
      this.clearLocalSession()
    }
  }

  async refreshToken(): Promise<string> {
    return performTokenRefresh()
  }

  async restoreSession(): Promise<AuthUser | null> {
    try {
      if (!browserSession.getAccessToken()) {
        await performTokenRefresh()
      }
      const response = await apiClient.get<AuthUser>('/auth/me')
      this.currentUser = response.data
      return response.data
    } catch {
      this.clearLocalSession()
      return null
    }
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser
  }

  getAccessToken(): string | null {
    return browserSession.getAccessToken()
  }

  isAuthenticated(): boolean {
    return Boolean(browserSession.getAccessToken() && this.currentUser)
  }

  clearLocalSession(): void {
    browserSession.clear()
    this.currentUser = null
    // One-way cleanup from versions that persisted bearer credentials in web storage.
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    sessionStorage.removeItem('accessToken')
    sessionStorage.removeItem('refreshToken')
  }
}

export const authService = new AuthService()
export default authService
