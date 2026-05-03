import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import RequestWithdrawalScreen from '../../screens/vet/RequestWithdrawalScreen'
import TransferVerificationScreen from '../../screens/vet/TransferVerificationScreen'
import { lazyScreen } from '../lazyScreen'

// VetEarningsScreen incluye EarningsBarChart con animaciones — lazy load
// para reducir el costo de startup del VetNavigator.
const VetEarningsScreen = lazyScreen(
  () => import('../../screens/vet/VetEarningsScreen'),
  { displayName: 'VetEarningsScreen' },
)

const Stack = createNativeStackNavigator()

/**
 * Stack del tab "Ingresos" del veterinario.
 *
 * Flujo:
 *  EarningsMain (KPIs + gráfico + transferencias pendientes)
 *    → TransferVerification (subir comprobante)
 *    → RequestWithdrawal (formulario de retiro)
 */
export default function VetEarningsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="EarningsMain" component={VetEarningsScreen} />
      <Stack.Screen
        name="TransferVerification"
        component={TransferVerificationScreen}
      />
      <Stack.Screen
        name="RequestWithdrawal"
        component={RequestWithdrawalScreen}
      />
    </Stack.Navigator>
  )
}
