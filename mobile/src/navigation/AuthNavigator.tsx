import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Platform } from 'react-native'

import type { AuthStackParamList } from './types'
import LoginScreen from '../screens/auth/LoginScreen'
import RegisterScreen from '../screens/auth/RegisterScreen'
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen'
import TwoFactorVerifyScreen from '../screens/auth/TwoFactorVerifyScreen'
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen'

const Stack = createNativeStackNavigator<AuthStackParamList>()

/**
 * AuthNavigator — flujo de autenticación.
 *
 * Decisiones:
 *  - `headerShown: false` por defecto: cada screen renderiza su propio header
 *    custom con la marca Nvet Care.
 *  - Animación de transición nativa para feel premium.
 *  - `gestureEnabled` solo en iOS (Android usa el botón back).
 */
export default function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: Platform.OS === 'ios',
        contentStyle: { backgroundColor: '#FAFAF7' },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      {/*
        TwoFactorVerify: navegado automáticamente cuando login retorna
        TWO_FACTOR_REQUIRED. Bloquea gestos para evitar swipe-back accidental
        que dejaría el flujo de login a medio camino.
      */}
      <Stack.Screen
        name="TwoFactorVerify"
        component={TwoFactorVerifyScreen}
        options={{ gestureEnabled: false }}
      />
      {/*
        ResetPassword: alcanzable vía deep link `nvetcare://reset-password?token=...`
        configurado en linking.ts. Animación bottom para distinguir del flujo normal.
      */}
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  )
}
