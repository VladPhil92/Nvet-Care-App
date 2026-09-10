import React from 'react'
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import type { VetTabParamList } from './types'
import TabBarIcon from '../components/navigation/TabBarIcon'
import { Colors } from '../theme/colors'
import { useMyVetProfileQuery } from '../hooks/queries/useMobileQueries'

import VetDashboardStack from './stacks/VetDashboardStack'
import VetScheduleStack from './stacks/VetScheduleStack'
import VetEarningsStack from './stacks/VetEarningsStack'
import VetProfileStack from './stacks/VetProfileStack'
import VetOnboardingScreen from '../screens/vet/VetOnboardingScreen'
import VetServiceAreaScreen from '../screens/vet/VetServiceAreaScreen'
import AiAssistantScreen from '../screens/shared/AiAssistantScreen'

const Tab = createBottomTabNavigator<VetTabParamList>()

/**
 * VetNavigator — bottom tabs para usuarios con rol VET.
 *
 * El rol ya fue definido al registrarse. Antes de montar módulos que dependen
 * de VetProfile, comprobamos que el perfil profesional exista y que la zona de
 * servicio sea geo-ready. Un perfil sin ciudad/coordenadas/radio válido queda
 * en el onboarding de cobertura y no puede acceder al dashboard operativo.
 */
export default function VetNavigator() {
  const profileQuery = useMyVetProfileQuery()
  const status = (profileQuery.error as { response?: { status?: number } } | null)?.response?.status

  if (profileQuery.isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Preparando Dashboard Veterinario…</Text>
      </View>
    )
  }

  if (profileQuery.isError && status === 404) {
    return <VetOnboardingScreen />
  }

  if (profileQuery.isError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorTitle}>No pudimos cargar tu perfil veterinario</Text>
        <Text style={styles.loadingText}>Verifica tu conexión e inténtalo nuevamente.</Text>
      </View>
    )
  }

  const profile = profileQuery.data
  const serviceRadius = Number((profile as { serviceRadius?: number | null } | undefined)?.serviceRadius ?? 0)
  const serviceAreaComplete = Boolean(
    profile?.city &&
      profile?.department &&
      profile?.latitude != null &&
      profile?.longitude != null &&
      Number.isFinite(serviceRadius) &&
      serviceRadius > 0,
  )

  if (profile && !serviceAreaComplete) {
    return <VetServiceAreaScreen profile={profile} />
  }

  return (
    <Tab.Navigator
      initialRouteName="VetDashboard"
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarShowLabel: true,
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.inkMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.line,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
        },
      }}
    >
      <Tab.Screen
        name="VetDashboard"
        component={VetDashboardStack}
        options={{
          tabBarLabel: 'Panel',
          tabBarAccessibilityLabel: 'Panel veterinario',
          tabBarTestID: 'vet-dashboard-tab',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="hospital" focused={focused} accent="gold" />
          ),
        }}
      />
      <Tab.Screen
        name="VetSchedule"
        component={VetScheduleStack}
        options={{
          tabBarLabel: 'Agenda',
          tabBarAccessibilityLabel: 'Mi agenda',
          tabBarTestID: 'vet-schedule-tab',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="calendar" focused={focused} accent="gold" />
          ),
        }}
      />
      <Tab.Screen
        name="VetAi"
        component={AiAssistantScreen}
        options={{
          tabBarLabel: 'Copiloto',
          tabBarAccessibilityLabel: 'Copiloto clínico de inteligencia artificial',
          tabBarTestID: 'vet-ai-tab',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="chat" focused={focused} accent="gold" showAccentDot />
          ),
        }}
      />
      <Tab.Screen
        name="VetEarnings"
        component={VetEarningsStack}
        options={{
          tabBarLabel: 'Ingresos',
          tabBarAccessibilityLabel: 'Mis ingresos',
          tabBarTestID: 'vet-earnings-tab',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="secure-payment" focused={focused} accent="gold" />
          ),
        }}
      />
      <Tab.Screen
        name="VetProfile"
        component={VetProfileStack}
        options={{
          tabBarLabel: 'Perfil',
          tabBarAccessibilityLabel: 'Mi perfil profesional',
          tabBarTestID: 'vet-profile-tab',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="profile" focused={focused} accent="gold" />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF7',
    gap: 14,
    padding: 28,
  },
  loadingText: {
    color: Colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorTitle: {
    color: Colors.ink,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
})
