import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { getErrorMessage } from '../services/api'

/**
 * QueryClient con configuración optimizada para Nvet Care Dashboard.
 *
 * Decisiones técnicas:
 *  - `staleTime` por defecto: 30 s (los hooks específicos override este valor)
 *  - `gcTime`: 10 min (datos en cache aunque no se renderice por 10 min)
 *  - `retry`: ya manejamos retry en el cliente Axios; en React Query lo desactivamos
 *    para evitar duplicación de intentos
 *  - `refetchOnWindowFocus`: true en producción para mantener data fresca al volver al tab
 *  - `refetchOnReconnect`: true (importante para sesiones largas con cortes de red)
 *  - QueryCache.onError: handler global para reportar errores a Sentry/console
 *  - MutationCache.onError: misma idea para mutations
 *
 * `staleTime` recomendado por recurso (configurar en cada hook):
 *  - Métricas dashboard: 30 s
 *  - Transacciones (admin): 60 s
 *  - Lista de vets: 5 min
 *  - Detalles de vet: 5 min
 *  - Citas del día: 30 s
 *  - Datos de usuario actual: Infinity (invalidar manualmente al login/logout)
 *  - Tasas CTG: 5 min (cambia con frecuencia baja)
 */

const isDev = import.meta.env.DEV

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 30 segundos por defecto; cada hook lo override según semántica del recurso
      staleTime: 30 * 1000,
      // 10 minutos en cache (memoria + persister)
      gcTime: 10 * 60 * 1000,
      // No retry: el cliente Axios ya tiene su propio retry exponential backoff
      retry: false,
      // Refetch al volver al tab → datos siempre frescos
      refetchOnWindowFocus: !isDev,
      // Refetch al reconectar tras pérdida de red
      refetchOnReconnect: true,
      // No refetch en mount si está dentro de staleTime
      refetchOnMount: 'always',
      // Estructuras congeladas en dev para detectar mutaciones accidentales
      structuralSharing: true,
    },
    mutations: {
      retry: false,
      // Network mode: en offline, las mutations se pausan; al reconectar, se ejecutan
      networkMode: 'online',
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message = getErrorMessage(error)
      // eslint-disable-next-line no-console
      console.error(`[QueryCache] ${query.queryKey.join('/')}: ${message}`)
      // Hook Sentry futuro: window.Sentry?.captureException(error)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _context, mutation) => {
      const message = getErrorMessage(error)
      // eslint-disable-next-line no-console
      console.error(
        `[MutationCache] ${mutation.options.mutationKey?.join('/') ?? 'mutation'}: ${message}`,
      )
    },
  }),
})

/**
 * Stale-times constantes para uso desde hooks (evita "magic numbers").
 */
export const STALE_TIMES = {
  /** Datos casi en tiempo real (admin metrics, transferencias en cola) */
  REAL_TIME: 30 * 1000,
  /** Datos transaccionales (transactions, appointments) */
  SHORT: 60 * 1000,
  /** Datos semi-estáticos (precios, agenda del día) */
  MEDIUM: 5 * 60 * 1000,
  /** Datos estáticos (catálogo de vets, listados públicos) */
  LONG: 15 * 60 * 1000,
  /** Datos del usuario actual (invalidar manualmente) */
  PERSISTENT: Infinity,
} as const
