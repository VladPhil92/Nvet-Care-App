import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Platform } from 'react-native'

import type { ClientTabParamList } from './types'
import TabBarIcon from '../components/navigation/TabBarIcon'
import { Colors } from '../theme/colors'

import ClientHomeStack from './stacks/ClientHomeStack'
import ClientSearchStack from './stacks/ClientSearchStack'
import ClientAppointmentsStack from './stacks/ClientAppointmentsStack'
import ClientProfileStack from './stacks/ClientProfileStack'
import AiAssistantScreen from '../screens/shared/AiAssistantScreen'

const Tab = createBottomTabNavigator<ClientTabParamList>()

/**
 * ClientNavigator — bottom tabs para usuarios CLIENT.
 *
 * Inicio · Servicios · Citas · IA · Perfil
 * La asistencia IA es contextual a las mascotas del usuario y no sustituye
 * la consulta veterinaria ni modifica historias clínicas.
 */
export default function ClientNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="ClientHome"
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarShowLabel: true,
        tabBarActiveTintColor: Colors.sage,
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
        name="ClientHome"
        component={ClientHomeStack}
        options={{
          tabBarLabel: 'Inicio',
          tabBarAccessibilityLabel: 'Pantalla de inicio',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="home" focused={focused} accent="sage" />
          ),
        }}
      />
      <Tab.Screen
        name="ClientSearch"
        component={ClientSearchStack}
        options={{
          tabBarLabel: 'Servicios',
          tabBarAccessibilityLabel: 'Servicios y veterinarios',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="services" focused={focused} accent="sage" />
          ),
        }}
      />
      <Tab.Screen
        name="ClientAppointments"
        component={ClientAppointmentsStack}
        options={{
          tabBarLabel: 'Citas',
          tabBarAccessibilityLabel: 'Mis citas',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="calendar" focused={focused} accent="sage" showAccentDot />
          ),
        }}
      />
      <Tab.Screen
        name="ClientAi"
        component={AiAssistantScreen}
        options={{
          tabBarLabel: 'IA',
          tabBarAccessibilityLabel: 'Asistente Nvet Care AI',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="chat" focused={focused} accent="sage" showAccentDot />
          ),
        }}
      />
      <Tab.Screen
        name="ClientProfile"
        component={ClientProfileStack}
        options={{
          tabBarLabel: 'Perfil',
          tabBarAccessibilityLabel: 'Mi perfil',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="profile" focused={focused} accent="sage" />
          ),
        }}
      />
    </Tab.Navigator>
  )
}
