import React, { useEffect } from 'react'
import { StatusBar } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native'
import * as Sentry from '@sentry/react-native'

import { QueryProvider } from './src/lib/QueryProvider'
import { UserModeProvider } from './src/contexts/UserModeContext'
import { I18nProvider } from './src/i18n/I18nProvider'
import RootNavigator from './src/navigation/RootNavigator'
import { linking } from './src/navigation/linking'
import runtimeTelemetry from './src/services/runtime-telemetry.service'
import { navigationIntegration } from './src/observability/sentry'

const navigationRef = createNavigationContainerRef()

/**
 * App raíz — orden de providers (de afuera hacia adentro):
 *
 *  1. GestureHandlerRootView: requerido por react-native-gesture-handler
 *     en la raíz para que las gestures funcionen en todas las screens.
 *  2. SafeAreaProvider: contexto de insets seguros (notch, home indicator)
 *     consumido por SafeAreaView en cada screen.
 *  3. I18nProvider: idioma con auto-detect del device + persistencia.
 *     No depende de otros providers, pero sí afecta el render de toda la UI.
 *  4. QueryProvider: TanStack Query con persistencia AsyncStorage. Tiene que
 *     estar antes que UserModeProvider para que `useCurrentUserQuery` funcione.
 *  5. UserModeProvider: contexto del modo CLIENT/VET (persistido).
 *  6. NavigationContainer: estado global de navegación + deep linking.
 *  7. RootNavigator: máquina de estados de navegación.
 *
 * La StatusBar se configura en cada screen según corresponda; aquí solo
 * dejamos un default sensato.
 */

function App() {
  useEffect(() => {
    runtimeTelemetry.emit('APP_STARTED')
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <QueryProvider>
            <UserModeProvider>
              <NavigationContainer
                ref={navigationRef}
                linking={linking}
                fallback={null}
                onReady={() => {
                  navigationIntegration.registerNavigationContainer(navigationRef)
                }}
              >
                <StatusBar barStyle="dark-content" />
                <RootNavigator />
              </NavigationContainer>
            </UserModeProvider>
          </QueryProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(App)
