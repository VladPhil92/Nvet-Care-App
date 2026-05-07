import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import ProfileScreen from '../../screens/shared/ProfileScreen'
import WalletScreen from '../../screens/shared/WalletScreen'
import NotificationsScreen from '../../screens/shared/NotificationsScreen'
import VetVerificationScreen from '../../screens/shared/VetVerificationScreen'
import UploadVerificationDocsScreen from '../../screens/shared/UploadVerificationDocsScreen'
import TopUpWalletScreen from '../../screens/shared/TopUpWalletScreen'
import EditProfileScreen from '../../screens/shared/EditProfileScreen'
import TwoFactorEnrollmentScreen from '../../screens/auth/TwoFactorEnrollmentScreen'
import ActiveSessionsScreen from '../../screens/shared/ActiveSessionsScreen'
import MyPetsScreen from '../../screens/shared/MyPetsScreen'

const Stack = createNativeStackNavigator()

/**
 * Stack del tab Perfil para usuarios CLIENT.
 *
 * Pantallas accesibles desde el menú del perfil:
 *   ProfileMain → Wallet / Notifications / VetVerification
 *
 * El cliente NO tiene acceso a PriceManagement (es solo del vet).
 */
export default function ClientProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="VetVerification" component={VetVerificationScreen} />
      <Stack.Screen
        name="UploadVerificationDocs"
        component={UploadVerificationDocsScreen}
      />
      <Stack.Screen name="TopUpWallet" component={TopUpWalletScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      {/* Seguridad: enrollment 2FA + lista de sesiones */}
      <Stack.Screen
        name="TwoFactorEnrollment"
        component={TwoFactorEnrollmentScreen}
      />
      <Stack.Screen name="ActiveSessions" component={ActiveSessionsScreen} />
      <Stack.Screen name="MyPets" component={MyPetsScreen} />
    </Stack.Navigator>
  )
}
