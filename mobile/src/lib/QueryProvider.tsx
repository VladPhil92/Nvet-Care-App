import React, { ReactNode } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { queryClient } from './queryClient'
import { registerDurableMutationDefaults } from './durableMutations'
import { shouldDehydrateDurableMutation } from './durableMutationPolicy'

/**
 * QueryProvider mobile con persistencia en AsyncStorage.
 *
 * Soporte offline-first:
 *  - Al abrir la app sin red, se rehidrata el cache desde AsyncStorage
 *    y se muestran los últimos datos disponibles.
 *  - Cuando NetInfo detecta reconexión, `onlineManager` dispara los refetch
 *    de queries marcadas como stale.
 *  - Solo mutations con contrato de replay explícitamente seguro se persisten
 *    entre reinicios. Phase 44 comienza con reservas idempotentes de citas.
 */

// Cache schema v3 invalidates pre-Phase-46 entries that were not explicitly
// bound to an authenticated user. Durable mutation policy remains unchanged.
const CACHE_BUSTER = 'nvet-mobile-cache-v3'

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'nvet-care-mobile-query-cache',
  // Throttle más agresivo en mobile (escribir a AsyncStorage es costoso)
  throttleTime: 3000,
})

// Must be registered before PersistQueryClientProvider hydrates its cache.
registerDurableMutationDefaults(queryClient)

interface QueryProviderProps {
  children: ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días: la app móvil puede estar offline más tiempo
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const status = query.state.status
            return status === 'success' && query.state.data !== undefined
          },
          shouldDehydrateMutation: shouldDehydrateDurableMutation,
        },
      }}
      onSuccess={async () => {
        // Restored mutations are resumed only after hydration. TanStack's
        // onlineManager keeps them paused until NetInfo confirms connectivity.
        await queryClient.resumePausedMutations()
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
