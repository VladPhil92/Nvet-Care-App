# Capa de Datos Cliente · @tanstack/react-query
**Sprint 1 — Día 3 · Fases 10.2 y 10.3 completadas**

Esta capa elimina los stores Zustand para data remota (mantenidos solo para UI state como `mode`, `filters`, `drafts`) y centraliza la sincronización con el backend en hooks declarativos.

---

## 1. Beneficios técnicos

| Beneficio | Antes (Zustand manual) | Ahora (React Query) |
|---|---|---|
| Cache compartido entre componentes | Manual | Automático por `queryKey` |
| Deduplicación de peticiones | Manual | Automático |
| Background refetch | Manual | `refetchOnWindowFocus`, `refetchOnReconnect` |
| Stale-while-revalidate | Manual | Built-in con `staleTime` |
| Optimistic updates con rollback | Manual | Patrón `onMutate` / `onError` / `onSettled` |
| Persistencia offline | Manual | `PersistQueryClientProvider` |
| DevTools | No | Integradas (Dashboard) |
| Loading / error / fetching states | Manual | `isPending` / `isError` / `isFetching` |
| Pagination + infinite scroll | Manual | `useInfiniteQuery` + `keepPreviousData` |

---

## 2. Estructura de archivos

### Dashboard
```
dashboard/src/
├── lib/
│   ├── queryClient.ts          # QueryClient + STALE_TIMES
│   ├── QueryProvider.tsx       # PersistQueryClientProvider + DevTools
│   └── queryKeys.ts            # qk.* factory + helpers
└── hooks/queries/
    ├── useAdminQueries.ts      # 6 queries (metrics, transactions, ...)
    ├── useAdminMutations.ts    # 4 mutations con optimistic updates
    └── useAuthQueries.ts       # me, login, register, logout
```

### Mobile
```
mobile/src/
├── lib/
│   ├── queryClient.ts          # QueryClient + onlineManager + focusManager
│   ├── QueryProvider.tsx       # PersistQueryClientProvider con AsyncStorage
│   └── queryKeys.ts            # qk.* factory mobile
└── hooks/queries/
    ├── useMobileQueries.ts     # 11 queries (auth, vets, appointments, payments)
    └── useMobileMutations.ts   # 7 mutations con optimistic updates
```

---

## 3. Stale times semánticos

```ts
STALE_TIMES = {
  REAL_TIME: 30 * 1000,     // métricas, tracking, balance
  SHORT: 60 * 1000,         // transacciones, citas, earnings
  MEDIUM: 5 * 60 * 1000,    // vets, precios, schedule
  LONG: 15 * 60 * 1000,     // catálogos, listados estáticos
  PERSISTENT: Infinity,     // usuario actual
}
```

---

## 4. Patrón de uso típico

### 4.1 Query simple
```tsx
import { useMetricsQuery } from '../hooks/queries/useAdminQueries'

function AdminDashboard() {
  const { data, isPending, isError, error, refetch } = useMetricsQuery({
    startDate: '2026-04-01',
    endDate: '2026-04-30',
  })

  if (isPending) return <Spinner />
  if (isError) return <ErrorState message={error.message} onRetry={refetch} />

  return <MetricsView metrics={data} />
}
```

### 4.2 Mutation con optimistic update
```tsx
import { useResolveDisputeMutation } from '../hooks/queries/useAdminMutations'

function DisputePanel({ tx }) {
  const { mutate, isPending } = useResolveDisputeMutation()

  const handleConfirm = () => {
    mutate(
      { transactionId: tx.id, resolution: 'CONFIRM', notes: '...' },
      {
        onSuccess: () => toast.success('Disputa resuelta'),
        // onError ya hace rollback automático
      },
    )
  }

  return <Button onClick={handleConfirm} loading={isPending}>Confirmar</Button>
}
```

### 4.3 Lista paginada con infinite scroll (Mobile)
```tsx
import { useInfiniteVetSearchQuery } from '../hooks/queries/useMobileQueries'

function SearchVetsScreen() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteVetSearchQuery({ city: 'Bogotá', minRating: 4 })

  const items = data?.pages.flatMap((p) => p.results) ?? []

  return (
    <FlashList
      data={items}
      onEndReached={() => hasNextPage && fetchNextPage()}
      ListFooterComponent={isFetchingNextPage ? <Spinner /> : null}
      renderItem={({ item }) => <VetCard vet={item} />}
    />
  )
}
```

---

## 5. Optimistic updates: anatomía

```ts
useMutation({
  mutationFn: ...,

  // 1. Antes de la petición: actualizar UI optimistamente
  onMutate: async (vars) => {
    await qc.cancelQueries({ queryKey: ... })   // detener refetches en vuelo
    const snapshot = qc.getQueryData(...)        // backup para rollback
    qc.setQueryData(..., (old) => ...)          // update optimista
    return { snapshot }                          // pasar al ctx
  },

  // 2. Si falla: rollback al snapshot
  onError: (err, vars, ctx) => {
    qc.setQueryData(..., ctx.snapshot)
  },

  // 3. Siempre: invalidar para refetch desde servidor
  onSettled: () => {
    qc.invalidateQueries({ queryKey: ... })
  },
})
```

---

## 6. Soporte offline (Mobile)

### Comportamiento
1. **Primera carga online**: queries van a red, datos se cachean en memoria + AsyncStorage
2. **Cierre de app + reapertura offline**: `PersistQueryClientProvider` rehidrata desde AsyncStorage; UI muestra última data conocida
3. **Reconexión**: `NetInfo` notifica a `onlineManager` → React Query refetch automático de queries stale
4. **Mutation offline**: queda pausada en `mutationCache`; al reconectar se ejecuta automáticamente (gracias a `networkMode: 'online'`)

### Configuración relevante
```ts
// queryClient.ts (mobile)
networkMode: 'offlineFirst',  // queries usan cache si offline
maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 días de retención offline
```

---

## 7. Invalidación predecible con query keys jerárquicos

```ts
qk.admin.transactions.all()        // ['admin', 'transactions']
qk.admin.transactions.list({...})  // ['admin', 'transactions', 'list', filters]
qk.admin.transactions.detail(id)   // ['admin', 'transactions', 'detail', id]
```

Invalidar `qk.admin.transactions.all()` invalida **toda la rama** (lists, detail, todos los filtros).

### Helpers de invalidación cruzada
```ts
import { invalidateAfterPayment, invalidateAfterVetUpdate } from './lib/queryKeys'

// Tras un pago: invalida payments, appointments, admin/transactions, transfer-tracking, metrics
await invalidateAfterPayment(qc, txId)

// Tras update de vet: invalida vets, admin/veterinarians, vet detail
await invalidateAfterVetUpdate(qc, vetId)
```

---

## 8. Integración en App raíz

### Dashboard (`main.tsx`)
```tsx
import { QueryProvider } from './lib/QueryProvider'
import { ErrorBoundary } from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryProvider>
      <App />
    </QueryProvider>
  </ErrorBoundary>
)
```

### Mobile (`App.tsx`)
```tsx
import { QueryProvider } from './src/lib/QueryProvider'

export default function App() {
  return (
    <QueryProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </QueryProvider>
  )
}
```

---

## 9. Métricas de éxito esperadas

| Métrica | Antes | Objetivo |
|---|---|---|
| Peticiones duplicadas | ~30% | 0% (deduplicación) |
| Cache hit rate | 0% | >70% |
| Time to interactive en navegación de regreso | refetch completo | instantáneo (cache hit) |
| Tamaño cache localStorage | 0 KB | ~200 KB típico |
| Tamaño cache AsyncStorage (mobile) | 0 KB | ~500 KB típico |
| UX en mutations | espera red | feedback instantáneo |

---

## 10. Dependencias requeridas

### Dashboard
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools \
  @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister
```

### Mobile
```bash
npm install @tanstack/react-query \
  @tanstack/react-query-persist-client @tanstack/query-async-storage-persister \
  @react-native-community/netinfo
```

---

## 11. Migración gradual desde Zustand stores

Los stores existentes (`useAdminStore`, `useAuthStore`, `useAppointmentStore`, etc.) se mantienen funcionando hasta que cada pantalla migre a hooks. La migración recomendada:

1. **Fase A**: nuevas pantallas usan hooks de Query directamente
2. **Fase B**: migrar pantallas existentes una por una; los stores Zustand devuelven solo UI state local
3. **Fase C**: eliminar lógica de fetching de los stores (queda solo modo, filtros, drafts)

No requiere cambios disruptivos en producción — coexistencia segura durante migración.

---

## Próxima Fase

**Sprint 1 — Día 4**: Performance Backend + Observabilidad (Fases 10.5 + 10.6)
- Helmet + compression + rate limiting (`@nestjs/throttler`)
- Logger estructurado con `pino` + request-id
- Health check `/health` (DB ping + memory)
- Sentry integration
