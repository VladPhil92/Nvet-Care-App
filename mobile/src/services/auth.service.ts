import AsyncStorage from '@react-native-async-storage/async-storage'
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
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    role: 'CLIENT' | 'VET' | 'ADMIN'
    firstName?: string
    lastName?: string
    vetProfile?: {
      id: string
      tier: 'FREE' | 'PRO' | 'ELITE'
      isVerified: boolean
    }
  }
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiClient.post('/auth/login', credentials)
    const { accessToken, refreshToken, user } = response.data

    // Guardar tokens en AsyncStorage
    await AsyncStorage.multiSet([
      ['accessToken', accessToken],
      ['refreshToken', refreshToken],
      ['user', JSON.stringify(user)],
    ])

    return response.data
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiClient.post('/auth/register', {
      ...data,
      role: 'CLIENT', // Por defecto todos empiezan como cliente
    })
    const { accessToken, refreshToken, user } = response.data

    // Guardar tokens en AsyncStorage
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
      // Limpiar tokens independientemente de si la llamada API falla
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

  async getCurrentUser() {
    const userStr = await AsyncStorage.getItem('user')
    return userStr ? JSON.parse(userStr) : null
  }

  async getAccessToken(): Promise<string | null> {
    return await AsyncStorage.getItem('accessToken')
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken()
    return !!token
  }

  async updateUserData(userData: Partial<AuthResponse['user']>): Promise<void> {
    const currentUser = await this.getCurrentUser()
    if (currentUser) {
      const updatedUser = { ...currentUser, ...userData }
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser))
    }
  }

  /**
   * Actualiza el perfil del usuario en el backend (PATCH /users/me) y
   * sincroniza con el cache local de AsyncStorage.
   */
  async updateProfile(data: {
    firstName?: string
    lastName?: string
    phone?: string
    avatar?: string
  }): Promise<AuthResponse['user']> {
    const response = await apiClient.patch('/users/me', data)
    const updatedUser = response.data
    await this.updateUserData(updatedUser)
    return updatedUser
  }
}

export const authService = new AuthService()
export default authService
