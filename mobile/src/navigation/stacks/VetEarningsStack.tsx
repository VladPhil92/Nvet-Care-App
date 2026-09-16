import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { VetEarningsStackParamList } from '../types'
import RequestWithdrawalScreen from '../../screens/vet/RequestWithdrawalScreen'
import { lazyScreen } from '../lazyScreen'

const VetEarningsScreen = lazyScreen<any>(
  () => import('../../screens/vet/VetEarningsScreen'),
  { displayName: 'VetEarningsScreen' },
)

const Stack = createNativeStackNavigator<VetEarningsStackParamList>()

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
        name="RequestWithdrawal"
        component={RequestWithdrawalScreen}
      />
    </Stack.Navigator>
  )
}
