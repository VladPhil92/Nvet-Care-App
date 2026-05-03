import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { ClientAppointmentsStackParamList } from '../types'
import MyAppointmentsScreen from '../../screens/client/MyAppointmentsScreen'
import AppointmentDetailPlaceholder from '../../screens/client/AppointmentDetailPlaceholder'
import AppointmentTrackingScreen from '../../screens/client/AppointmentTrackingScreen'
import ChatScreen from '../../screens/shared/ChatScreen'

const Stack = createNativeStackNavigator<ClientAppointmentsStackParamList>()

/**
 * Stack interno del tab de Citas.
 *
 * Flujo:
 *   AppointmentsList (Lista) → AppointmentDetail / Tracking / Chat
 */
export default function ClientAppointmentsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="AppointmentsList"
        component={MyAppointmentsScreen}
      />
      <Stack.Screen
        name="AppointmentDetail"
        component={AppointmentDetailPlaceholder}
      />
      <Stack.Screen
        name="AppointmentTracking"
        component={AppointmentTrackingScreen}
      />
      <Stack.Screen
        name="ChatScreen"
        component={ChatScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  )
}
