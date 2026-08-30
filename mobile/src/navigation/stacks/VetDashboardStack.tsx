import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { VetDashboardStackParamList } from '../types'
import VetDashboardScreen from '../../screens/vet/VetDashboardScreen'
import VetAppointmentDetailScreen from '../../screens/vet/VetAppointmentDetailScreen'

const Stack = createNativeStackNavigator<VetDashboardStackParamList>()

/**
 * El dashboard navega a `VetAppointmentDetail`; el navigator usa el mismo
 * contrato compartido que el resto de la capa de navegación para evitar drift.
 */
export default function VetDashboardStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="DashboardMain" component={VetDashboardScreen} />
      <Stack.Screen
        name="VetAppointmentDetail"
        component={VetAppointmentDetailScreen}
      />
    </Stack.Navigator>
  )
}
