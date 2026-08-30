import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import VetDashboardScreen from '../../screens/vet/VetDashboardScreen'
import VetAppointmentDetailScreen from '../../screens/vet/VetAppointmentDetailScreen'

type VetDashboardStackParamList = {
  DashboardMain: undefined
  VetAppointmentDetail: { appointmentId: string }
}

const Stack = createNativeStackNavigator<VetDashboardStackParamList>()

/**
 * El dashboard ya navega a `VetAppointmentDetail`; este stack hace explícito
 * ese contrato en vez de intentar resolver la pantalla desde el bottom tab.
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
