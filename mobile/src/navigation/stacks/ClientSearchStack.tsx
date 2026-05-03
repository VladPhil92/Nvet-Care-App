import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { ClientSearchStackParamList } from '../types'
import SearchVetsScreen from '../../screens/client/SearchVetsScreen'
import VetDetailsScreen from '../../screens/client/VetDetailsScreen'
import { lazyScreen } from '../lazyScreen'

// BookAppointmentScreen es la pantalla más pesada (1000+ LOC con stepper).
// Se carga on-demand cuando el cliente decide reservar, no al montar el stack.
const BookAppointmentScreen = lazyScreen(
  () => import('../../screens/client/BookAppointmentScreen'),
  { displayName: 'BookAppointmentScreen' },
)

const Stack = createNativeStackNavigator<ClientSearchStackParamList>()

/**
 * Stack interno del tab de búsqueda.
 *
 * Flujo principal:
 *   SearchMain (Buscar) → VetDetail (Perfil del vet) → BookAppointment (Reservar)
 *
 * El BookAppointment se presenta en stack normal (no modal) para mantener
 * el botón "Atrás" del header del stepper consistente con la nav nativa.
 */
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
          // Slide from bottom para semantic emphasis del flujo crítico
          animation: 'slide_from_bottom',
          // Bloquea swipe-to-go-back (queremos el botón explícito por idempotency)
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  )
}
