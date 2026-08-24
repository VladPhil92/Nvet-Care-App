import { apiClient } from './api'

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
  role?: 'CLIENT' | 'VET' | 'ADMIN'
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    role: string
    firstName?: string
    lastName?: string
  }
}

class AuthService {
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
    const { accessToken, refreshToken, user } = response.data

    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('user', JSON.stringify(user))

    return response.data
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data)
    const { accessToken, refreshToken, user } = response.data

    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('user', JSON.stringify(user))

    return response.data
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout')
    } finally {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
    }
  }

  async refreshToken(): Promise<string> {
    const refreshToken = localStorage.getItem('refreshToken')
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await apiClient.post('/auth/refresh', { refreshToken })
    const { accessToken, refreshToken: newRefreshToken } = response.data

    localStorage.setItem('accessToken', accessToken)
    if (newRefreshToken) {
      localStorage.setItem('refreshToken', newRefreshToken)
    }

    return accessToken
  }

  getCurrentUser(): AuthResponse['user'] | null {
    const userStr = localStorage.getItem('user')
    return userStr ? (JSON.parse(userStr) as AuthResponse['user']) : null
  }

  getAccessToken(): string | null {
    return localStorage.getItem('accessToken')
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken()
  }
}

export const authService = new AuthService()
export default authService
