import {
  QueryClient,
  QueryCache,
  MutationCache,
  onlineManager,
  focusManager,
} from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { AppState, AppStateStatus, Platform } from 'react-native'
import { getErrorMessage } from '../services/api'

/**
 * QueryClient para la app móvil.
 *
 * Diferencias clave vs Dashboard:
 *  - `networkMode: 'offlineFirst'`: queries se ejecutan desde cache si offline,
 *    y los mutations se pausan hasta reconectar (con `networkMode: 'online'`)
 *  - Integración con `NetInfo` vía `onlineManager.setEventListener`
 *  - Integración con `AppState` vía `focusManager.setEventListener`
 *    (re-fetch al volver al foreground)
 *  - `gcTime` mayor (1 hora) porque la app puede estar en background
 *  - Defaults más laxos (mobile networks pueden ser inestables)
 *
 * `staleTime` recomendado por recurso:
 *  - Mis citas: 60 s
 *  - Próxima cita: 30 s
 *  - Búsqueda de vets: 5 min
 *  - Detalles de vet: 10 min
 *  - Balance / wallet: 30 s
 *  - Mensajes de chat: ya manejado por WebSocket → cache 5 min
 */

// ============================================================
// ONLINE MANAGER (NetInfo)
// ============================================================
// React Query tiene su propia detección de online (basada en window.navigator),
// pero en RN necesitamos NetInfo para detectar cambios de red móvil/wifi.
onlineManager.setEventListener((setOnline) => {
  const unsubscribe = NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected && !!state.isInternetReachable)
  })
  return () => {
    unsubscribe()
  }
})

// ============================================================
// FOCUS MANAGER (AppState)
// ============================================================
// Refetch al volver al foreground (típico en mobile: usuario suspende y abre la app horas después)
focusManager.setEventListener((handleFocus) => {
  const onChange = (status: AppStateStatus) => {
    if (Platform.OS !== 'web') {
      handleFocus(status === 'active')
    }
  }
  const subscription = AppState.addEventListener('change', onChange)
  return () => subscription.remove()
})

// ============================================================
// CLIENT
// ============================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 min default
      gcTime: 60 * 60 * 1000, // 1 hora (mobile suele estar en background)
      retry: false, // Axios ya maneja retry
      refetchOnReconnect: true,
      // Mobile: refetch al volver al foreground vía focusManager
      refetchOnWindowFocus: true,
      // OfflineFirst: si hay cache, mostrar y refetch en background
      networkMode: 'offlineFirst',
      structuralSharing: true,
    },
    mutations: {
      retry: false,
      // Mutations en online: si offline, pausan hasta reconectar
      networkMode: 'online',
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message = getErrorMessage(error)
      console.warn(`[QueryCache] ${query.queryKey.join('/')}: ${message}`)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      const message = getErrorMessage(error)
      console.warn(
        `[MutationCache] ${mutation.options.mutationKey?.join('/') ?? 'mutation'}: ${message}`,
      )
    },
  }),
})

// ============================================================
// STALE TIMES
// ============================================================

export const STALE_TIMES = {
  REAL_TIME: 30 * 1000,
  SHORT: 60 * 1000,
  MEDIUM: 5 * 60 * 1000,
  LONG: 15 * 60 * 1000,
  PERSISTENT: Infinity,
} as const
