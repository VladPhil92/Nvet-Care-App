import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { ClientSearchStackParamList } from '../types'
import SearchVetsScreen from '../../screens/client/SearchVetsScreen'
import VetDetailsScreen from '../../screens/client/VetDetailsScreen'
import { lazyScreen } from '../lazyScreen'

// La pantalla conserva su tipado interno; el boundary lazy se mantiene genérico
// porque React Navigation inyecta las props del stack en runtime.
const BookAppointmentScreen = lazyScreen<any>(
  () => import('../../screens/client/BookAppointmentScreen'),
  { displayName: 'BookAppointmentScreen' },
)

const Stack = createNativeStackNavigator<ClientSearchStackParamList>()

export default function ClientSearchStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="SearchMain" component={SearchVetsScreen} />
      <Stack.Screen name="VetDetail" component={VetDetailsScreen} />
      <Stack.Screen
        name="BookAppointment"
        component={BookAppointmentScreen}
        options={{
          animation: 'slide_from_bottom',
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  )
}
