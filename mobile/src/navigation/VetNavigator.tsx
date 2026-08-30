import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Platform } from 'react-native'

import type { VetTabParamList } from './types'
import TabBarIcon from '../components/navigation/TabBarIcon'
import { Colors } from '../theme/colors'

import VetDashboardStack from './stacks/VetDashboardStack'
import VetScheduleStack from './stacks/VetScheduleStack'
import VetEarningsStack from './stacks/VetEarningsStack'
import VetProfileStack from './stacks/VetProfileStack'

const Tab = createBottomTabNavigator<VetTabParamList>()

/**
 * VetNavigator — bottom tabs para usuarios VET (rol veterinario).
 *
 * Diferenciación visual vs ClientNavigator:
 *  - Acento Gold/Naranja (#FF8A3D) vs Verde Principal del cliente
 *  - Grid de 4 tabs: Dashboard · Agenda · Ingresos · Perfil
 *  - Iconos del sistema oficial line+nodes
 */
export default function VetNavigator() {
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
