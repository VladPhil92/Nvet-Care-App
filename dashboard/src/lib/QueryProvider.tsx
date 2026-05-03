import { ReactNode } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from './queryClient'

/**
 * QueryProvider — wrapper con persistencia de cache en localStorage.
 *
 * - Cache buster: incrementar `buster` para invalidar todas las caches persistidas.
 * - `maxAge`: 24 h. Después se descarta y se refetch.
 * - `dehydrateOptions.shouldDehydrateQuery`: solo persiste queries con datos válidos
 *   (evita persistir errores o queries fallidas).
 * - `ReactQueryDevtools` solo en dev (tree-shaken en build de producción).
 */

const APP_VERSION = '1.0.0'

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'nvet-care-query-cache',
  // Throttle: serializa a localStorage máximo cada 1s
  throttleTime: 1000,
})

interface QueryProviderProps {
  children: ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        // Cache buster: cambia al desplegar nueva versión para invalidar cachés viejas
        buster: APP_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // No persistir queries fallidas o sin datos
            const status = query.state.status
            return status === 'success' && query.state.data !== undefined
          },
        },
      }}
      onSuccess={() => {
        // Hook futuro: notificar a la app que cache fue rehidratada
        // y que se puede asumir datos disponibles
      }}
    >
      {children}
      {import.meta.env.DEV && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </PersistQueryClientProvider>
  )
}
