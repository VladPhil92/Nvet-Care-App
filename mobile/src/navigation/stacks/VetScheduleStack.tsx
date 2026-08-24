import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { VetScheduleStackParamList } from '../types'
import AppointmentDetailPlaceholder from '../../screens/client/AppointmentDetailPlaceholder'
import { lazyScreen } from '../lazyScreen'

const VetScheduleScreen = lazyScreen<any>(
  () => import('../../screens/vet/VetScheduleScreen'),
  { displayName: 'VetScheduleScreen' },
)

const Stack = createNativeStackNavigator<VetScheduleStackParamList>()

export default function VetScheduleStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ScheduleMain" component={VetScheduleScreen} />
      <Stack.Screen
        name="VetAppointmentDetail"
        component={AppointmentDetailPlaceholder}
      />
    </Stack.Navigator>
  )
}
