import type { LinkingOptions } from '@react-navigation/native'
import type { RootStackParamList } from './types'

/**
 * Configuración de deep linking.
 *
 * Esquemas soportados:
 *  - `nvetcare://` (custom scheme; clientes que ya tienen la app instalada)
 *  - `https://app.nvetcare.co` (universal links iOS / app links Android)
 *
 * Ejemplos:
 *  - nvetcare://login                              → AuthStack > Login
 *  - nvetcare://appointment/abc-123                → ClientStack > AppointmentDetail
 *  - nvetcare://chat/abc-123                       → ChatModal
 *  - https://app.nvetcare.co/vet/uuid              → ClientStack > Search > VetDetail
 *
 * Para activar Universal Links / App Links en producción:
 *  - iOS: configurar `apple-app-site-association` en el dominio
 *  - Android: configurar `assetlinks.json` y `<intent-filter>` en AndroidManifest
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

  /**
   * Hook para procesar la URL inicial al abrir la app.
   * Permite custom logic antes de delegar a React Navigation.
   */
  async getInitialURL() {
    // En producción, podríamos chequear notificaciones push pendientes
    // que tengan deep link asociado. Por ahora, comportamiento default.
    return null
  },
}
