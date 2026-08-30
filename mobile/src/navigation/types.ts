import type { NavigatorScreenParams } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { CompositeScreenProps } from '@react-navigation/native'

// ============================================================
// AUTH STACK (público)
// ============================================================
export type AuthStackParamList = {
  Login: undefined
  Register: { role?: 'CLIENT' | 'VET' } | undefined
  ForgotPassword: undefined
  TwoFactorVerify: { email: string; password: string }
  TwoFactorRecovery: { email: string; password: string }
  ResetPassword: { token: string }
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

export type ClientHomeStackParamList = {
  HomeMain: undefined
  AppointmentDetail: { appointmentId: string }
  AppointmentTracking: { appointmentId: string }
  Help: undefined
  Emergency: undefined
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
  Help: undefined
  Emergency: undefined
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
  VetAppointmentDetail: { appointmentId: string }
  PatientHistory: { petId: string }
}

export type VetEarningsStackParamList = {
  EarningsMain: undefined
  TransferVerification: { transactionId: string }
  RequestWithdrawal: undefined
}

// ============================================================
// SHARED
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
  MyPets: undefined
  TwoFactorEnrollment: undefined
  ActiveSessions: undefined
  PriceManagement: undefined
  RequestWithdrawal: undefined
  TransferVerification: { transactionId: string }
  ChangePassword: undefined
}

// ============================================================
// ROOT
// ============================================================
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  Client: NavigatorScreenParams<ClientTabParamList>
  Vet: NavigatorScreenParams<VetTabParamList>
  ChatModal: { appointmentId: string }
}

// ============================================================
// HELPERS
// ============================================================
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

export type TwoFactorEnrollmentScreenProps = NativeStackScreenProps<
  SharedStackParamList,
  'TwoFactorEnrollment'
>
export type ActiveSessionsScreenProps = NativeStackScreenProps<
  SharedStackParamList,
  'ActiveSessions'
>

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
