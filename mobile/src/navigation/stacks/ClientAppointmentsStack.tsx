import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { ClientAppointmentsStackParamList } from '../types'
import MyAppointmentsScreen from '../../screens/client/MyAppointmentsScreen'
import AppointmentDetailScreen from '../../screens/client/AppointmentDetailScreen'
import AppointmentTrackingScreen from '../../screens/client/AppointmentTrackingScreen'
import ChatScreen from '../../screens/shared/ChatScreen'

const Stack = createNativeStackNavigator<ClientAppointmentsStackParamList>()

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
        component={AppointmentDetailScreen}
      />
      <Stack.Screen name="AppointmentTracking">
        {({ navigation, route }) => (
          <AppointmentTrackingScreen
            navigation={navigation}
            route={{ params: { id: route.params.appointmentId } }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="ChatScreen"
        component={ChatScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  )
}
