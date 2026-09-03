import { create } from 'zustand'
import {
  authService,
  AuthResponse,
  LoginCredentials,
  RegisterData,
  type AuthUser,
} from '../services/auth.service'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (credentials: LoginCredentials) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (credentials) => {
    set({ isLoading: true, error: null })
    try {
      const response: AuthResponse = await authService.login(credentials)
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error: any) {
      set({
        user: null,
        isAuthenticated: false,
        error: error.response?.data?.message || 'Error al iniciar sesión',
        isLoading: false,
      })
      throw error
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null })
    try {
      const response: AuthResponse = await authService.register(data)
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error: any) {
      set({
        user: null,
        isAuthenticated: false,
        error: error.response?.data?.message || 'Error al registrarse',
        isLoading: false,
      })
      throw error
    }
  },

  logout: async () => {
    set({ isLoading: true })
    try {
      await authService.logout()
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      })
    }
  },

  checkAuth: async () => {
    set({ isLoading: true, error: null })
    const user = await authService.restoreSession()
    set({
      user,
      isAuthenticated: Boolean(user),
      isLoading: false,
    })
  },

  clearError: () => {
    set({ error: null })
  },
}))
