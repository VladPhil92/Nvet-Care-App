import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'
import { authService } from '../../services/auth.service'

/**
 * Hooks de autenticación.
 *
 * Diseño:
 *  - `useCurrentUserQuery`: queries el usuario actual; cache `Infinity` (invalidar manualmente)
 *  - `useLoginMutation`: tras login exitoso, prime `me` cache con la respuesta
 *  - `useLogoutMutation`: limpia TODO el cache (no solo auth) para evitar leaks de datos
 *    de un usuario a otro al hacer logout/login en el mismo navegador
 */

// ============================================================
// CURRENT USER
// ============================================================

export function useCurrentUserQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.auth.me(),
    queryFn: () => authService.getCurrentUser(),
    staleTime: STALE_TIMES.PERSISTENT,
    // No habilitado por defecto si no hay token; el componente raíz decide
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

// ============================================================
// LOGIN
// ============================================================

interface LoginVars {
  email: string
  password: string
}

export function useLoginMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['auth', 'login'],
    mutationFn: ({ email, password }: LoginVars) =>
      authService.login({ email, password }),

    onSuccess: (data) => {
      // Prime el cache con el usuario recién autenticado
      qc.setQueryData(qk.auth.me(), data.user)
      // Invalidar todo lo demás (puede contener datos del usuario anterior si hubo)
      // pero NO el `auth.me` que acabamos de setear
      qc.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] !== 'auth'
        },
      })
    },
  })
}

// ============================================================
// REGISTER
// ============================================================

interface RegisterVars {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
  role: 'CLIENT' | 'VET'
}

export function useRegisterMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['auth', 'register'],
    mutationFn: (vars: RegisterVars) => authService.register(vars),

    onSuccess: (data) => {
      qc.setQueryData(qk.auth.me(), data.user)
    },
  })
}

// ============================================================
// LOGOUT
// ============================================================

export function useLogoutMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['auth', 'logout'],
    mutationFn: () => authService.logout(),

    onSuccess: () => {
      // Limpiar TODO el cache para prevenir leaks entre sesiones de usuarios distintos
      qc.clear()
    },

    onError: () => {
      // Aunque falle el logout en backend, limpiar cliente
      qc.clear()
    },
  })
}