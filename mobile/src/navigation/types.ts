import type { NavigatorScreenParams } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { CompositeScreenProps } from '@react-navigation/native'

/**
 * Param lists tipadas — el corazón del type-safety en React Navigation.
 *
 * Cada navigator declara su propio Param List. Cuando un screen necesita
 * tipo seguro de su `route` y `navigation` props, importa el helper
 * correspondiente de este archivo (ej. `LoginScreenProps`).
 *
 * Beneficios:
 *  - Auto-completado en IDE para `navigation.navigate('NombreRuta', { params })`
 *  - Errores de compilación si pasas params incorrectos
 *  - Refactor seguro: renombrar una ruta lo detecta TypeScript en todos sus usos
 */

// ============================================================
// AUTH STACK (público)
// ============================================================
export type AuthStackParamList = {
  Login: undefined
  Register: { role?: 'CLIENT' | 'VET' } | undefined
  ForgotPassword: undefined
  /**
   * Step de verificación TOTP durante login. Se navega automáticamente
   * cuando el backend retorna `error: 'TWO_FACTOR_REQUIRED'`.
   * Recibe email+password para reintentar el login con el código TOTP.
   */
  TwoFactorVerify: { email: string; password: string }
  /**
   * Login alternativo cuando el usuario perdió el autenticador.
   */
  TwoFactorRecovery: { email: string; password: string }
  /**
   * Reset de password vía deep link recibido por email
   * (`nvetcare://reset-password?token=...`).
   */
  ResetPassword: { token: string }
  /**
   * Verificación de email vía deep link
   * (`nvetcare://verify-email?token=...`).
   */
  VerifyEmail: { token: string }
}

// ============================================================
// CLIENT TAB
// ============================================================
export type ClientTabParamList = {
  ClientHome: undefined
  ClientSearch: { specialty?: string; city?: string } | undefined
  ClientAppointments: undefined
  ClientProfile: undefined
}

// Stack interno de cada tab (para navegar a detalles dentro del tab)
export type ClientHomeStackParamList = {
  HomeMain: undefined
  AppointmentDetail: { appointmentId: string }
  AppointmentTracking: { appointmentId: string }
  Emergency: undefined
  /** Tienda de productos veterinarios (estado: Coming Soon) */
  Store: { category?: string } | undefined
}

export type ClientSearchStackParamList = {
  SearchMain: { specialty?: string; city?: string } | undefined
  VetDetail: { vetId: string }
  BookAppointment: { vetId: string; serviceType?: string }
}

export type ClientAppointmentsStackParamList = {
  AppointmentsList: undefined
  AppointmentDetail: { appointmentId: string }
  AppointmentTracking: { appointmentId: string }
  ChatScreen: { appointmentId: string }
}

// ============================================================
// VET TAB
// ============================================================
export type VetTabParamList = {
  VetDashboard: undefined
  VetSchedule: undefined
  VetEarnings: undefined
  VetProfile: undefined
}

export type VetDashboardStackParamList = {
  DashboardMain: undefined
  AppointmentDetail: { appointmentId: string }
  AddClinicalNotes: { appointmentId: string }
}

export type VetScheduleStackParamList = {
  ScheduleMain: undefined
  PatientHistory: { petId: string }
}

export type VetEarningsStackParamList = {
  EarningsMain: undefined
  TransferVerification: { transactionId: string }
  RequestWithdrawal: undefined
}

// ============================================================
// SHARED (accesible desde ambos modos)
// ============================================================
export type SharedStackParamList = {
  ProfileMain: undefined
  EditProfile: undefined
  Wallet: undefined
  Notifications: undefined
  Settings: undefined
  VetVerification: undefined
  UploadVerificationDocs: undefined
  TopUpWallet: undefined
  /**
   * Configuración y enrollment de 2FA TOTP. Solo accesible desde Profile
   * para usuarios autenticados que quieren activar 2FA.
   */
  TwoFactorEnrollment: undefined
  /**
   * Lista de sesiones activas del usuario con revoke individual + revoke-all.
   */
  ActiveSessions: undefined
  /**
   * Solo en VetProfileStack:
   */
  PriceManagement: undefined
  RequestWithdrawal: undefined
  TransferVerification: { transactionId: string }
}

// ============================================================
// ROOT (state machine principal)
// ============================================================
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  Client: NavigatorScreenParams<ClientTabParamList>
  Vet: NavigatorScreenParams<VetTabParamList>
  /** Pantalla shared modal-like (presentation: 'modal') */
  ChatModal: { appointmentId: string }
}

// ============================================================
// HELPERS DE PROPS PARA CADA SCREEN
// ============================================================

// Auth
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>
export type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>
export type ForgotPasswordScreenProps = NativeStackScreenProps<
  AuthStackParamList,
  'ForgotPassword'
>
export type TwoFactorVerifyScreenProps = NativeStackScreenProps<
  AuthStackParamList,
  'TwoFactorVerify'
>
export type ResetPasswordScreenProps = NativeStackScreenProps<
  AuthStackParamList,
  'ResetPassword'
>
export type VerifyEmailScreenProps = NativeStackScreenProps<
  AuthStackParamList,
  'VerifyEmail'
>

// Shared (Profile)
export type TwoFactorEnrollmentScreenProps = NativeStackScreenProps<
  SharedStackParamList,
  'TwoFactorEnrollment'
>
export type ActiveSessionsScreenProps = NativeStackScreenProps<
  SharedStackParamList,
  'ActiveSessions'
>

// Client tabs
export type ClientHomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<ClientTabParamList, 'ClientHome'>,
  NativeStackScreenProps<RootStackParamList>
>
export type ClientSearchScreenProps = BottomTabScreenProps<
  ClientTabParamList,
  'ClientSearch'
>
export type ClientAppointmentsScreenProps = BottomTabScreenProps<
  ClientTabParamList,
  'ClientAppointments'
>

// Vet tabs
export type VetDashboardScreenProps = BottomTabScreenProps<
  VetTabParamList,
  'VetDashboard'
>
export type VetScheduleScreenProps = BottomTabScreenProps<
  VetTabParamList,
  'VetSchedule'
>
export type VetEarningsScreenProps = BottomTabScreenProps<
  VetTabParamList,
  'VetEarnings'
>
