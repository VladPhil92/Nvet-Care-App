import React, { ReactNode } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { queryClient } from './queryClient'

/**
 * QueryProvider mobile con persistencia en AsyncStorage.
 *
 * Soporte offline-first:
 *  - Al abrir la app sin red, se rehidrata el cache desde AsyncStorage
 *    y se muestran los últimos datos disponibles.
 *  - Cuando NetInfo detecta reconexión, `onlineManager` dispara los refetch
 *    de queries marcadas como stale.
 *
 * Cache buster: cambiar `APP_VERSION` cuando cambien estructuras de datos
 * para evitar parsear cache viejo incompatible.
 */

const APP_VERSION = '1.0.0'

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'nvet-care-mobile-query-cache',
  // Throttle más agresivo en mobile (escribir a AsyncStorage es costoso)
  throttleTime: 3000,
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
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días: la app móvil puede estar offline más tiempo
        buster: APP_VERSION,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const status = query.state.status
            return status === 'success' && query.state.data !== undefined
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
