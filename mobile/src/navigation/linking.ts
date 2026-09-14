import type { LinkingOptions } from '@react-navigation/native'
import type { RootStackParamList } from './types'

/**
 * Configuración de deep linking.
 *
 * Esquemas soportados:
 *  - `nvetcare://` (custom scheme; clientes que ya tienen la app instalada)
 *  - `https://app.nvetcare.co` (universal links iOS / app links Android)
 *
 * La federación CTG One usa exclusivamente un authorization code efímero:
 * `nvetcare://auth/ctgone/callback?code=...&state=...`
 * Nunca se aceptan bearer tokens en la URL.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'nvetcare://',
    'https://app.nvetcare.co',
    'https://nvetcare.co',
  ],

  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          Register: 'register',
          ForgotPassword: 'forgot-password',
          CtgFederationCallback: 'auth/ctgone/callback',
        },
      },
      Client: {
        screens: {
          ClientHome: 'home',
          ClientSearch: {
            path: 'search',
            parse: {
              specialty: (s: string) => decodeURIComponent(s),
              city: (s: string) => decodeURIComponent(s),
            },
          },
          ClientAppointments: 'appointments',
          ClientProfile: 'profile',
        },
      },
      Vet: {
        screens: {
          VetDashboard: 'vet/dashboard',
          VetSchedule: 'vet/schedule',
          VetEarnings: 'vet/earnings',
          VetProfile: 'vet/profile',
        },
      },
      ChatModal: {
        path: 'chat/:appointmentId',
        parse: {
          appointmentId: (id: string) => id,
        },
      },
    },
  },
}
