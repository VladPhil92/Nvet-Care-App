import { create } from 'zustand'
import { authService, AuthResponse, LoginCredentials, RegisterData } from '../services/auth.service'

interface User {
  id: string
  email: string
  role: string
  firstName?: string
  lastName?: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: authService.getCurrentUser(),
  isAuthenticated: authService.isAuthenticated(),
  isLoading: false,
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
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      })
    } catch (error: any) {
      set({ isLoading: false })
      // Limpiar estado local incluso si la llamada API falla
      set({
        user: null,
        isAuthenticated: false,
        error: null,
      })
    }
  },

  checkAuth: () => {
    const user = authService.getCurrentUser()
    const isAuthenticated = authService.isAuthenticated()
    set({ user, isAuthenticated })
  },

  clearError: () => {
    set({ error: null })
  },
}))
