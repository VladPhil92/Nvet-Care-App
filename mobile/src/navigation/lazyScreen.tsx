import React, { Suspense, ComponentType, lazy } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { UI_COLORS } from '../components/ui/primitives'

/**
 * lazyScreen — helper para code-splitting de pantallas pesadas.
 *
 * Uso:
 *   const BookAppointmentScreen = lazyScreen(
 *     () => import('../screens/client/BookAppointmentScreen'),
 *   )
 *
 * Beneficios:
 *  - El bundle inicial solo carga las pantallas críticas (auth + home)
 *  - Las pantallas pesadas se descargan on-demand al navegar a ellas
 *  - Mejora time-to-interactive en startup, especialmente en Android low-end
 *
 * Decisión:
 *  - El fallback es un spinner discreto centrado (no skeleton porque las
 *    pantallas pesadas tienen layouts muy diferentes)
 *  - Se mantiene `displayName` para devtools de React
 *  - Cuando el bundle se carga, React reutiliza el lazy resolved sin re-fetch
 */

interface LazyScreenOptions {
  displayName?: string
}

export function lazyScreen<P = any>(
  importer: () => Promise<{ default: ComponentType<P> }>,
  options?: LazyScreenOptions,
): ComponentType<P> {
  const LazyComponent = lazy(importer)

  const Wrapper = (props: P) => (
    <Suspense fallback={<ScreenFallback />}>
      <LazyComponent {...(props as any)} />
    </Suspense>
  )

  if (options?.displayName) {
    Wrapper.displayName = options.displayName
  }

  return Wrapper
}

function ScreenFallback() {
  return (
    <View style={styles.fallback} accessibilityLabel="Cargando pantalla">
      <ActivityIndicator size="large" color={UI_COLORS.sage} />
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_COLORS.bg,
  },
})
