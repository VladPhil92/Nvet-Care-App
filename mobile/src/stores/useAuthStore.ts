import { create } from 'zustand'
import authService, { AuthResponse, AuthUser, RegisterData } from '../services/auth.service'

type User = AuthUser

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  updateUser: (userData: Partial<User>) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const response: AuthResponse = await authService.login(email, password)
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al iniciar sesión',
        isLoading: false,
        isAuthenticated: false,
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
        isAuthenticated: false,
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
    set({ isLoading: true })
    try {
      const isAuth = await authService.isAuthenticated()
      const user = isAuth ? await authService.getCurrentUser() : null
      set({
        user,
        isAuthenticated: !!user,
        isLoading: false,
      })
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  updateUser: (userData: Partial<User>) => {
    const { user } = get()
    if (user) {
      const updated = { ...user, ...userData }
      set({ user: updated })
      void authService.updateUserData(userData)
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
