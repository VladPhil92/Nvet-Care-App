import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import AppointmentDetailPlaceholder from '../../screens/client/AppointmentDetailPlaceholder'
import { lazyScreen } from '../lazyScreen'

// VetScheduleScreen incluye WeekScheduleEditor (grid 7×11) — carga lazy
// para evitar montar todo al iniciar el VetNavigator.
const VetScheduleScreen = lazyScreen(
  () => import('../../screens/vet/VetScheduleScreen'),
  { displayName: 'VetScheduleScreen' },
)

const Stack = createNativeStackNavigator()

/**
 * Stack del tab "Agenda" del veterinario.
 *
 * Flujo: ScheduleMain → VetAppointmentDetail (al tap en celda reservada)
 * El detalle reusa el placeholder por ahora; tendrá UI específica del vet
 * (notas clínicas, marcar en curso/completado) en el Sprint 3.
 */
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
