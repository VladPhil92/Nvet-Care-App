# FlashList Migration Guide
**Estado**: Documentado, no aplicado. El proyecto sigue usando `FlatList` con performance hints.

## Por qué FlashList
[`@shopify/flash-list`](https://shopify.github.io/flash-list/) es un drop-in replacement para `FlatList` que:
- Recicla views agresivamente (reduce memoria 50-70% en lists >100 items)
- Reduce blank cells durante scroll fast (mejor que `windowSize`)
- Mejora 5-10× el frame time en listas largas con cells complejos

## Pantallas candidatas
1. **SearchVetsScreen** — la lista más larga (vets, paginada con `useInfiniteVetSearchQuery`)
2. **MyAppointmentsScreen** — citas del usuario (puede crecer a 100+ con histórico)
3. **WalletScreen** — transactions paginadas con scroll infinito
4. **NotificationsScreen** — lista por tipo

Las listas cortas (PriceManagementScreen, BookingDateSelector, etc.) NO necesitan migrar.

## Pasos de migración

### 1. Instalar dependencia
```bash
cd mobile
npm install @shopify/flash-list
# o
yarn add @shopify/flash-list
```

### 2. Reemplazar imports
```diff
- import { FlatList } from 'react-native'
+ import { FlashList } from '@shopify/flash-list'
```

### 3. Adaptar props
```diff
  <FlashList
    data={items}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => <ItemCard item={item} />}
+   estimatedItemSize={88}  // height en dp del item típico
-   windowSize={11}
-   maxToRenderPerBatch={10}
-   initialNumToRender={8}
-   removeClippedSubviews
  />
```

`estimatedItemSize` es **obligatorio** — usa el alto promedio del item.

### 4. Si el item tiene altura variable, agregar `getItemType`
```typescript
const getItemType = (item: any) => item.type ?? 'default'

<FlashList
  ...
  getItemType={getItemType}
/>
```

Esto permite a FlashList hacer recycling separado por tipo de item.

### 5. Reemplazar `ItemSeparatorComponent` por margin/padding
FlashList no soporta `ItemSeparatorComponent` con la misma performance que FlatList. Usa `marginBottom` en el item directamente.

## Estimaciones de performance (proyecto Nvet)

| Lista | Items típicos | FlatList (current) | FlashList (target) |
|---|---|---|---|
| SearchVets | 20-100 | ~16ms/scroll | ~6ms/scroll |
| MyAppointments | 5-30 | OK | sin cambio significativo |
| Wallet (txs) | 20-200+ | drops to 30fps en scroll fast | sostiene 60fps |

## Decisión de no migrar ahora
- Las listas actuales no son críticamente lentas (todas <20ms/scroll en tests anecdóticos)
- FlashList agrega ~150KB al bundle
- Migración tarda ~2-4 horas por las verificaciones de `estimatedItemSize`

Migrar cuando:
- Cualquier lista en producción reciba >100 items habitualmente
- Sentry/Crashlytics reporte JS thread blocks en `FlatList.render`
- Métricas Lighthouse-equivalentes (FPS) caigan <50 en listas
