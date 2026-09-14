import { Linking } from 'react-native'
import { secureStorage } from '../lib/secureStorage'
import authService, { type AuthResponse } from './auth.service'

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

    const supported = await Linking.canOpenURL(url)
    if (!supported) {
      await secureStorage.clearCtgFederationRequest().catch(() => undefined)
      throw new CtgFederationError(
        'CTG_ONE_BROWSER_UNAVAILABLE',
        'No se pudo abrir CTG One en el navegador del dispositivo.',
      )
    }
    await Linking.openURL(url)
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
    return { code, verifier }
  }

  async exchange(
    pending: PendingCtgFederationExchange,
    twoFactorCode?: string,
  ): Promise<AuthResponse> {
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
      const serverCode = typeof data?.error === 'string' ? data.error : 'FEDERATION_EXCHANGE_FAILED'
      const message =
        typeof data?.message === 'string'
          ? data.message
          : 'No se pudo completar el acceso con CTG One.'
      throw new CtgFederationError(serverCode, message, response.status)
    }

    if (!data?.accessToken || !data?.refreshToken || !data?.user?.id) {
      throw new CtgFederationError(
        'INCOMPLETE_FEDERATED_SESSION',
        'CTG One devolvió una sesión incompleta.',
        502,
      )
    }

    return authService.acceptFederatedSession(data as AuthResponse)
  }
}

export const ctgFederationService = new CtgFederationService()
export default ctgFederationService
