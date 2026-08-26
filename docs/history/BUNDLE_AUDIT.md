# Bundle audit · Nvet Care Platform

Esta guía describe cómo medir y reducir el tamaño del bundle del dashboard
(Vite + React) y del mobile (React Native + Hermes), junto con los
thresholds objetivo y la rationale.

## Por qué importa

- **Dashboard**: el tamaño del bundle inicial determina el TTI (time-to-interactive)
  para el primer paint. Cada 100KB extra de JS añade ~100-200ms en 4G LTE.
- **Mobile**: el JS bundle se ejecuta antes del primer frame; bundles >2MB
  causan splash screen prolongado y abandono.

## Thresholds objetivo (production)

| Métrica | Dashboard | Mobile |
|---|---|---|
| Initial JS gzipped | ≤ 180 KB | n/a |
| Initial JS uncompressed | ≤ 500 KB | ≤ 2 MB |
| Vendor chunk gzipped | ≤ 90 KB | n/a |
| CSS initial gzipped | ≤ 25 KB | n/a |
| Total assets initial | ≤ 250 KB gzip | ≤ 3 MB |
| Lazy chunks | sin límite (cada uno ≤ 200 KB) | ≤ 500 KB |
| Hermes bytecode size | n/a | ≤ 8 MB |

> Las métricas de mobile se miden con `react-native-bundle-visualizer`
> sobre el bundle de **release** (Hermes-compiled).

## Dashboard — comandos

```bash
# Build con análisis (genera dist/bundle-stats.html)
cd dashboard
npm run analyze

# Abrir el reporte
start dist/bundle-stats.html   # Windows
open  dist/bundle-stats.html   # macOS
```

El análisis usa `rollup-plugin-visualizer` con `template: 'treemap'`,
`gzipSize` y `brotliSize` para mostrar tres columnas de tamaño por chunk.

### Manual chunks aplicados (vite.config.ts)

```ts path=null start=null
manualChunks: {
  'react-vendor':  ['react', 'react-dom'],
  'query-vendor':  ['@tanstack/react-query', '@tanstack/react-query-persist-client'],
  'state-vendor':  ['zustand'],
  'http-vendor':   ['axios'],
}
```

Beneficios:

- React Query y Axios casi nunca cambian → caché HTTP eterna en CDN
- Cambios al código de la app NO invalidan el chunk de vendor
- `chunkSizeWarningLimit: 500` falla el build si un chunk app supera 500 KB

### Code-splitting recomendado (rutas)

Cada ruta principal debe usar `React.lazy`:

```tsx path=null start=null
const AdminDashboard  = lazy(() => import('./pages/AdminDashboard'))
const TiersPage       = lazy(() => import('./pages/TiersPage'))
const TrackingPage    = lazy(() => import('./pages/TrackingPage'))
const AccountingPage  = lazy(() => import('./pages/AccountingPage'))
const VetPanel        = lazy(() => import('./pages/VetPanel'))
const MobileApp       = lazy(() => import('./pages/MobileApp'))
```

Esto extrae cada página a un chunk separado que se descarga al
navegar. El initial bundle queda con: `App` + `Sidebar` + `Logos` +
primera página visible.

## Mobile — comandos

```bash
# 1. Generar bundle de release (Android)
cd mobile
react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android-release.bundle \
  --sourcemap-output android-release.bundle.map

# 2. Visualizar (instala react-native-bundle-visualizer si no lo tienes)
npx react-native-bundle-visualizer --platform android --dev false

# 3. Para iOS
npx react-native-bundle-visualizer --platform ios --dev false
```

### Hermes bytecode (Android release)

Hermes precompila JS a bytecode reduciendo memoria y startup:

```bash
cd mobile/android
./gradlew bundleRelease
ls -lh app/build/outputs/bundle/release/app-release.aab
unzip -l app-release.aab | grep -E "\.hbc$|\.so$"
```

`index.android.bundle.hbc` debe ser **30-40% menor** que el JS source.

### Estrategias de reducción para mobile

| Optimización | Impacto estimado | Status |
|---|---|---|
| Hermes engine habilitado | -25-40% startup, -15% memoria | ✅ default RN 0.70+ |
| `enableProguardInReleaseBuilds = true` | -15-25% APK | ⏳ pendiente |
| `enableSeparateBuildPerCPUArchitecture` | -50% por APK por arch | ⏳ pendiente |
| `react-native-fast-image` (vs Image) | -30% memoria en lists | ⏳ pendiente |
| `FlashList` (vs FlatList) | -50% items en memoria | 📝 documentado en FLASHLIST_MIGRATION.md |
| Lazy screens con `React.lazy` | -30% initial JS | ✅ aplicado a 3 screens pesadas |
| Tree-shake de `react-native-vector-icons` | -200KB | ⏳ usar solo familias necesarias |
| Tree-shake de `react-native-maps` | n/a (lazy) | ✅ lazy en AppointmentTracking |

## Dashboard — guía de optimización paso a paso

1. **Auditar baseline**

   ```bash
   cd dashboard
   npm run build
   du -sh dist/
   du -sh dist/assets/*.js | sort -h
   ```

2. **Identificar el chunk más grande**

   Abrir `dist/bundle-stats.html` (tras `npm run analyze`) y ordenar por
   tamaño. Los típicos sospechosos:

   - `recharts` o cualquier librería de gráficos → considerar `react-tradingview-embed` o gráficos custom
   - Iconos completos (e.g. `@mui/icons-material`) → solo importar los usados
   - Polyfills duplicados → revisar `browserslist`

3. **Aplicar `React.lazy` a páginas no-críticas**

4. **Revisar `package.json`** y eliminar deps no usadas

5. **Re-medir**

   La meta es bajar el initial gzipped por debajo del threshold antes
   de cada release.

## CI integration (sugerida, no aplicada aún)

Agregar al workflow `.github/workflows/ci.yml`:

```yaml path=null start=null
- name: Bundle size check
  run: |
    cd dashboard
    npm run analyze
    BUNDLE_SIZE=$(du -b dist/assets/index-*.js | awk '{print $1}')
    LIMIT=512000
    if [ "$BUNDLE_SIZE" -gt "$LIMIT" ]; then
      echo "::error::Bundle size $BUNDLE_SIZE bytes exceeds limit $LIMIT"
      exit 1
    fi
```

Esto convierte el budget en un required check antes del merge.

## Referencias

- [Vite manual chunks](https://vitejs.dev/guide/build.html#chunking-strategy)
- [Hermes performance](https://hermesengine.dev/docs/performance/)
- [React Native bundle visualizer](https://github.com/IjzerenHein/react-native-bundle-visualizer)
- [WCAG perf budget guidelines](https://web.dev/articles/performance-budgets-101)
