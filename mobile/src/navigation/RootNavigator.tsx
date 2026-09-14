import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native'

import NvetLogo from '../components/brand/NvetLogo'
import type { RootStackParamList } from './types'
import { useCurrentUserQuery } from '../hooks/queries/useMobileQueries'
import { Colors, FontSize, Spacing, Typography } from '../theme/tokens'

import AuthNavigator from './AuthNavigator'
import ClientNavigator from './ClientNavigator'
import VetNavigator from './VetNavigator'
import AdminPortalScreen from '../screens/shared/AdminPortalScreen'
import ChatModalScreen from '../screens/shared/ChatScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()

/**
 * RootNavigator — máquina de estados de navegación principal.
 *
 * Estados posibles:
 *  1. Cargando (`isPending` && primera query): splash canónico de Nvet Care
 *  2. No autenticado: AuthStack (Login/Register)
 *  3. Autenticado como CLIENT: ClientNavigator
 *  4. Autenticado como VET: VetNavigator
 *  5. Autenticado como ADMIN/SUPERADMIN: handoff explícito al dashboard web
 *     canónico, sin exponer acciones CLIENT que el backend debe rechazar.
 *
 * El rol persistido por el backend es la única autoridad para decidir el
 * dashboard. El cliente móvil no remapea ni degrada privilegios.
 */
function SplashScreen() {
  return (
    <View style={styles.splash}>
      <NvetLogo width={170} height={85} />
      <Text style={styles.brand}>Nvet Care</Text>
      <ActivityIndicator size="large" color={Colors.sage} style={styles.spinner} />
      <Text style={styles.subtitle}>Cargando…</Text>
    </View>
  )
}

export default function RootNavigator() {
  const { data: user, isPending, isError } = useCurrentUserQuery()

  if (isPending) {
    return <SplashScreen />
  }

  const isAuthenticated = !!user && !isError
  const isVet = user?.role === 'VET'
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN'
  const flowKey = !isAuthenticated
    ? 'auth-flow'
    : isVet
      ? 'vet-flow'
      : isAdmin
        ? 'admin-flow'
        : 'client-flow'

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
      key={flowKey}
    >
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : isVet ? (
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
      ) : isAdmin ? (
        <Stack.Screen name="Admin" component={AdminPortalScreen} />
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
    backgroundColor: Colors.canvas,
  },
  brand: {
    fontFamily: Typography.sans,
    fontSize: FontSize.h1,
    fontWeight: '700',
    color: Colors.dark,
    letterSpacing: 0.2,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  spinner: {
    marginBottom: Spacing.lg,
  },
  subtitle: {
    fontFamily: Typography.sans,
    color: Colors.inkMuted,
    fontSize: FontSize.body,
  },
})
