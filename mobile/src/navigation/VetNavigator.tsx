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

const Tab = createBottomTabNavigator<VetTabParamList>()

/**
 * VetNavigator — bottom tabs para usuarios con rol VET.
 *
 * El rol ya fue definido al registrarse. Antes de montar módulos que dependen
 * de VetProfile, comprobamos que el perfil profesional exista; cuentas VET
 * nuevas o legacy sin perfil pasan por un onboarding profesional de una sola vez.
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
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="calendar" focused={focused} accent="gold" />
          ),
        }}
      />
      <Tab.Screen
        name="VetEarnings"
        component={VetEarningsStack}
        options={{
          tabBarLabel: 'Ingresos',
          tabBarAccessibilityLabel: 'Mis ingresos',
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
  },
  loadingText: {
    color: Colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
  },
})
