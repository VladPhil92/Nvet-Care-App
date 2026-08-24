import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiClient } from './api'

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
  role?: 'CLIENT' | 'VET' | 'ADMIN'
}

export interface AuthUser {
  id: string
  email: string
  role: 'CLIENT' | 'VET' | 'ADMIN'
  firstName?: string
  lastName?: string
  phone?: string
  avatar?: string
  vetProfile?: {
    id: string
    licenseNumber?: string
    specialties?: string[]
    tier: 'FREE' | 'PRO' | 'ELITE'
    ctgBalance?: number
    rating?: number
    isVerified: boolean
    verificationStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
  }
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
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

    await AsyncStorage.multiSet([
      ['accessToken', accessToken],
      ['refreshToken', refreshToken],
      ['user', JSON.stringify(user)],
    ])

    return response.data
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', {
      ...data,
      role: data.role ?? 'CLIENT',
    })
    const { accessToken, refreshToken, user } = response.data

    await AsyncStorage.multiSet([
      ['accessToken', accessToken],
      ['refreshToken', refreshToken],
      ['user', JSON.stringify(user)],
    ])

    return response.data
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout')
    } finally {
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user'])
    }
  }

  async refreshToken(): Promise<string> {
    const refreshToken = await AsyncStorage.getItem('refreshToken')
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await apiClient.post('/auth/refresh', { refreshToken })
    const { accessToken, refreshToken: newRefreshToken } = response.data

    await AsyncStorage.setItem('accessToken', accessToken)
    if (newRefreshToken) {
      await AsyncStorage.setItem('refreshToken', newRefreshToken)
    }

    return accessToken
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const userStr = await AsyncStorage.getItem('user')
    return userStr ? (JSON.parse(userStr) as AuthUser) : null
  }

  async getAccessToken(): Promise<string | null> {
    return AsyncStorage.getItem('accessToken')
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken()
    return !!token
  }

  async updateUserData(userData: Partial<AuthUser>): Promise<void> {
    const currentUser = await this.getCurrentUser()
    if (currentUser) {
      const updatedUser = { ...currentUser, ...userData }
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser))
    }
  }

  async updateProfile(data: {
    firstName?: string
    lastName?: string
    phone?: string
    avatar?: string
  }): Promise<AuthUser> {
    const response = await apiClient.patch<AuthUser>('/users/me', data)
    const updatedUser = response.data
    await this.updateUserData(updatedUser)
    return updatedUser
  }
}

export const authService = new AuthService()
export default authService
