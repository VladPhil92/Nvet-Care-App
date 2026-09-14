import { Linking } from 'react-native'
import { secureStorage } from '../lib/secureStorage'
import authService, { type AuthResponse } from './auth.service'
import runtimeTelemetry from './runtime-telemetry.service'

const CTG_ONE_ORIGIN = 'https://ctgone.com'
const AUTHORIZE_URL = `${CTG_ONE_ORIGIN}/api/nvetcareapp/mobile/authorize`
const TOKEN_URL = `${CTG_ONE_ORIGIN}/api/nvetcareapp/mobile/token`
export const CTG_FEDERATION_REDIRECT_URI = 'nvetcare://auth/ctgone/callback'

export type PendingCtgFederationExchange = {
  code: string
  verifier: string
}

export class CtgFederationError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'CtgFederationError'
    this.code = code
    this.status = status
  }
}

function encode(value: string): string {
  return encodeURIComponent(value)
}

class CtgFederationService {
  async start(): Promise<void> {
    await secureStorage.clearCtgFederationRequest().catch(() => undefined)
    const request = await secureStorage.createCtgFederationRequest()
    const url =
      `${AUTHORIZE_URL}?response_type=code` +
      `&code_challenge=${encode(request.codeChallenge)}` +
      `&code_challenge_method=${request.codeChallengeMethod}` +
      `&state=${encode(request.state)}` +
      `&redirect_uri=${encode(CTG_FEDERATION_REDIRECT_URI)}`

    runtimeTelemetry.emit('CTG_FEDERATION_STARTED')

    // Do not probe HTTPS handlers with Linking.canOpenURL(). On Android 11+
    // package visibility can make that probe return false even when the system
    // browser can open the URL. openURL() delegates directly to the OS; a real
    // launch failure is handled below and the pending PKCE request is erased.
    try {
      await Linking.openURL(url)
    } catch {
      await secureStorage.clearCtgFederationRequest().catch(() => undefined)
      throw new CtgFederationError(
        'CTG_ONE_BROWSER_UNAVAILABLE',
        'No se pudo abrir CTG One en el navegador del dispositivo.',
      )
    }
  }

  async consumeCallback(code: string, state: string): Promise<PendingCtgFederationExchange> {
    if (!code || !state) {
      await secureStorage.clearCtgFederationRequest().catch(() => undefined)
      throw new CtgFederationError(
        'INVALID_CALLBACK',
        'CTG One devolvió una respuesta incompleta.',
      )
    }

    const verifier = await secureStorage.consumeCtgFederationRequest(state)
    runtimeTelemetry.emit('CTG_FEDERATION_CALLBACK_RECEIVED')
    return { code, verifier }
  }

  async exchange(
    pending: PendingCtgFederationExchange,
    twoFactorCode?: string,
  ): Promise<AuthResponse> {
    const startedAt = Date.now()

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({
          code: pending.code,
          codeVerifier: pending.verifier,
          redirectUri: CTG_FEDERATION_REDIRECT_URI,
          twoFactorCode: twoFactorCode?.trim() || undefined,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const serverCode =
          typeof data?.error === 'string' ? data.error : 'FEDERATION_EXCHANGE_FAILED'
        const message =
          typeof data?.message === 'string'
            ? data.message
            : 'No se pudo completar el acceso con CTG One.'

        // A TOTP challenge is a continuation of the same valid PKCE exchange,
        // not a failed federation attempt. The server reservation is released
        // specifically for this retry path.
        if (serverCode !== 'TWO_FACTOR_REQUIRED') {
          runtimeTelemetry.emit('CTG_FEDERATION_EXCHANGE_FAILURE', {
            durationMs: Date.now() - startedAt,
            outcomeCode: serverCode,
          })
        }
        throw new CtgFederationError(serverCode, message, response.status)
      }

      if (!data?.accessToken || !data?.refreshToken || !data?.user?.id) {
        runtimeTelemetry.emit('CTG_FEDERATION_EXCHANGE_FAILURE', {
          durationMs: Date.now() - startedAt,
          outcomeCode: 'INCOMPLETE_FEDERATED_SESSION',
        })
        throw new CtgFederationError(
          'INCOMPLETE_FEDERATED_SESSION',
          'CTG One devolvió una sesión incompleta.',
          502,
        )
      }

      const session = await authService.acceptFederatedSession(data as AuthResponse)
      runtimeTelemetry.emit('CTG_FEDERATION_EXCHANGE_SUCCESS', {
        durationMs: Date.now() - startedAt,
      })
      return session
    } catch (error) {
      if (error instanceof CtgFederationError) throw error
      runtimeTelemetry.emit('CTG_FEDERATION_EXCHANGE_FAILURE', {
        durationMs: Date.now() - startedAt,
        outcomeCode: 'NETWORK_ERROR',
      })
      throw new CtgFederationError(
        'FEDERATION_NETWORK_ERROR',
        'No se pudo contactar a CTG One para completar el acceso.',
      )
    }
  }
}

export const ctgFederationService = new CtgFederationService()
export default ctgFederationService
