import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native'

import type { RootStackParamList } from './types'
import { useCurrentUserQuery } from '../hooks/queries/useMobileQueries'
import { useUserMode } from '../hooks/useUserMode'

import AuthNavigator from './AuthNavigator'
import ClientNavigator from './ClientNavigator'
import VetNavigator from './VetNavigator'
import ChatModalScreen from '../screens/shared/ChatScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()

/**
 * RootNavigator — máquina de estados de navegación principal.
 *
 * Estados posibles:
 *  1. Cargando (`isPending` && primera query): splash con spinner
 *  2. No autenticado: AuthStack (Login/Register)
 *  3. Autenticado como CLIENT: ClientNavigator (bottom tabs Sage)
 *  4. Autenticado con role=VET y modo='VET': VetNavigator (bottom tabs Gold)
 *  5. Autenticado con role=VET pero modo='CLIENT': ClientNavigator
 *     (un vet puede operar como cliente para reservar para sus propias mascotas)
 *  6. Autenticado como ADMIN: ClientNavigator por ahora (admin usa el dashboard web)
 *
 * Decisiones:
 *  - El `key` del Stack.Navigator cambia cuando cambia el rol/modo, forzando
 *    un re-mount limpio (evita memory leaks de listeners en stacks viejos).
 *  - `ChatModal` es accesible desde cualquier estado autenticado vía
 *    `navigation.navigate('ChatModal', { appointmentId })`.
 */

const COLORS = {
  sage: '#5B7553',
  bg: '#FAFAF7',
  text: '#1F2A1B',
  muted: '#5F6B5A',
} as const

function SplashScreen() {
  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>Nvet Care</Text>
      <ActivityIndicator size="large" color={COLORS.sage} style={styles.spinner} />
      <Text style={styles.subtitle}>Cargando…</Text>
    </View>
  )
}

export default function RootNavigator() {
  const { data: user, isPending, isError } = useCurrentUserQuery()
  const { mode } = useUserMode()

  // Splash mientras decidimos el flujo (primera carga)
  if (isPending) {
    return <SplashScreen />
  }

  const isAuthenticated = !!user && !isError
  const role = user?.role
  const isVet = role === 'VET'
  const showVetUI = isVet && mode === 'VET'

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
      // Cambiar key cuando el flujo principal cambia → re-mount limpio
      key={
        isAuthenticated
          ? showVetUI
            ? 'vet-flow'
            : 'client-flow'
          : 'auth-flow'
      }
    >
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : showVetUI ? (
        <>
          <Stack.Screen name="Vet" component={VetNavigator} />
          <Stack.Screen
            name="ChatModal"
            component={ChatModalScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Client" component={ClientNavigator} />
          <Stack.Screen
            name="ChatModal"
            component={ChatModalScreen}
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </>
      )}
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  brand: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.sage,
    letterSpacing: 1,
    marginBottom: 24,
  },
  spinner: {
    marginBottom: 16,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
  },
})
