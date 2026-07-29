import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { ClientHomeStackParamList } from '../types'
import HomeScreenV2 from '../../screens/client/HomeScreenV2'
import AppointmentDetailScreen from '../../screens/client/AppointmentDetailScreen'
import AppointmentTrackingScreen from '../../screens/client/AppointmentTrackingScreen'
import EmergencyScreen from '../../screens/client/EmergencyScreen'
import StoreScreen from '../../screens/client/StoreScreen'

const Stack = createNativeStackNavigator<ClientHomeStackParamList>()

/**
 * Stack interno del tab de Inicio. Permite navegar de la home a detalle/tracking
 * /emergency sin perder la tab bar (que vive un nivel arriba en `ClientNavigator`).
 *
 * `Emergency` se presenta con `slide_from_bottom` para semantic emphasis del flujo
 * de emergencia (consistente con el mockup oficial "Emergencias 24/7").
 */
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
      <Stack.Screen
        name="AppointmentTracking"
        component={AppointmentTrackingScreen}
      />
      <Stack.Screen
        name="Emergency"
        component={EmergencyScreen}
        options={{
          animation: 'slide_from_bottom',
          gestureEnabled: true,
        }}
      />
      {/*
        Store: pantalla "Próximamente" de la tienda de productos.
        Accesible desde HomeScreenV2 (card de tienda y sección de productos).
        Presenta con slide_from_bottom para un feel de modal exploratorio.
      */}
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
