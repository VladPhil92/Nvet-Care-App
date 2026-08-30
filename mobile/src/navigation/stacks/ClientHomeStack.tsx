import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { ClientHomeStackParamList } from '../types'
import HomeScreenV2 from '../../screens/client/HomeScreenV2'
import AppointmentDetailScreen from '../../screens/client/AppointmentDetailScreen'
import AppointmentTrackingScreen from '../../screens/client/AppointmentTrackingScreen'
import HelpCenterScreen from '../../screens/client/HelpCenterScreen'
import EmergencyScreen from '../../screens/client/EmergencyScreen'
import StoreScreen from '../../screens/client/StoreScreen'

const Stack = createNativeStackNavigator<ClientHomeStackParamList>()

export default function ClientHomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="HomeMain" component={HomeScreenV2} />
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
        name="Help"
        component={HelpCenterScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Emergency"
        component={EmergencyScreen}
        options={{
          animation: 'slide_from_bottom',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="Store"
        component={StoreScreen}
        options={{
          animation: 'slide_from_bottom',
          gestureEnabled: true,
        }}
      />
    </Stack.Navigator>
  )
}
