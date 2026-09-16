import { create } from 'zustand'
import authService, { AuthResponse, AuthUser, RegisterData } from '../services/auth.service'
import { adoptSessionCacheOwner, clearSessionCache } from '../lib/sessionCache'

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
      // authService.login already adopts the session cache owner via
      // persistSession -> adoptAuthenticatedUser; calling it again here was
      // redundant and, worse, ran a second time outside that atomic sequence.
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
      // See login: authService.register already adopts the session cache
      // owner via persistSession -> adoptAuthenticatedUser.
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
      // authService.logout already clears the session cache via clearSession.
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

      if (user) {
        await adoptSessionCacheOwner(user.id)
      } else {
        await clearSessionCache()
      }

      set({
        user,
        isAuthenticated: !!user,
        isLoading: false,
      })
    } catch {
      await clearSessionCache()
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
      authService.updateUserData(userData).catch(() => {
        // El estado remoto/local se reconciliará en el siguiente checkAuth.
      })
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
