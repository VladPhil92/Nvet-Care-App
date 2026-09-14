import AsyncStorage from '@react-native-async-storage/async-storage'
import { NativeModules, Platform } from 'react-native'

/**
 * SecureStorage — almacenamiento canónico de sesión.
 *
 * Android release/dev usa un módulo nativo propio respaldado por Android
 * Keystore. Los tokens se cifran con AES-256-GCM y únicamente el ciphertext
 * se persiste en SharedPreferences. No existe fallback a AsyncStorage en
 * runtime: si el vault seguro no está disponible, la autenticación falla
 * cerrada en vez de degradar silenciosamente la seguridad.
 *
 * El mismo vault genera y conserva state + verifier PKCE para la federación
 * CTG One. El verifier nunca se persiste en JavaScript ni AsyncStorage.
 */

type TokenBundle = {
  accessToken: string
  refreshToken: string
}

export type CtgFederationRequest = {
  state: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
}

type NativeSecureStorage = {
  setTokens(accessToken: string, refreshToken: string): Promise<void>
  getTokens(): Promise<TokenBundle | null>
  clearTokens(): Promise<void>
  createCtgFederationRequest(): Promise<CtgFederationRequest>
  consumeCtgFederationRequest(callbackState: string): Promise<string>
  clearCtgFederationRequest(): Promise<void>
}

const nativeVault = NativeModules.NvetSecureStorage as NativeSecureStorage | undefined
let testTokens: TokenBundle | null = null
let testFederation: { state: string; verifier: string } | null = null

function isTestEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
}

function testBase64Url(bytes: number[]): string {
  return bytes.map((value) => value.toString(16).padStart(2, '0')).join('')
}

function requireNativeVault(): NativeSecureStorage {
  if (nativeVault) return nativeVault

  if (isTestEnvironment()) {
    return {
      async setTokens(accessToken: string, refreshToken: string) {
        testTokens = { accessToken, refreshToken }
      },
      async getTokens() {
        return testTokens
      },
      async clearTokens() {
        testTokens = null
      },
      async createCtgFederationRequest() {
        const nonce = Date.now().toString(36)
        const state = `test-state-${nonce}`
        const verifier = `test-verifier-${nonce}-${testBase64Url([1, 2, 3, 4])}`
        testFederation = { state, verifier }
        return {
          state,
          codeChallenge: `test-challenge-${nonce}`,
          codeChallengeMethod: 'S256' as const,
        }
      },
      async consumeCtgFederationRequest(callbackState: string) {
        if (!testFederation) throw new Error('FEDERATION_REQUEST_MISSING')
        if (testFederation.state !== callbackState) {
          testFederation = null
          throw new Error('FEDERATION_STATE_MISMATCH')
        }
        const verifier = testFederation.verifier
        testFederation = null
        return verifier
      },
      async clearCtgFederationRequest() {
        testFederation = null
      },
    }
  }

  throw new Error(
    `SECURE_STORAGE_UNAVAILABLE: Nvet requires native protected token storage on ${Platform.OS}.`,
  )
}

export const secureStorage = {
  async setTokens(tokens: TokenBundle): Promise<void> {
    await requireNativeVault().setTokens(tokens.accessToken, tokens.refreshToken)
  },

  async getTokens(): Promise<TokenBundle | null> {
    return requireNativeVault().getTokens()
  },

  async clearTokens(): Promise<void> {
    await requireNativeVault().clearTokens()
  },

  async createCtgFederationRequest(): Promise<CtgFederationRequest> {
    return requireNativeVault().createCtgFederationRequest()
  },

  async consumeCtgFederationRequest(callbackState: string): Promise<string> {
    return requireNativeVault().consumeCtgFederationRequest(callbackState)
  },

  async clearCtgFederationRequest(): Promise<void> {
    await requireNativeVault().clearCtgFederationRequest()
  },

  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getTokens()
    return tokens?.accessToken ?? null
  },

  async getRefreshToken(): Promise<string | null> {
    const tokens = await this.getTokens()
    return tokens?.refreshToken ?? null
  },

  isSecure(): boolean {
    return Boolean(nativeVault)
  },
}

// =====================================================================
// Profile cache — AsyncStorage (non-secret UI cache only)
// =====================================================================

export interface CachedProfile {
  id: string
  email: string
  firstName?: string
  lastName?: string
  role?: string
  phone?: string
  avatar?: string | null
  vetProfile?: unknown
}

export const profileCache = {
  async set(profile: CachedProfile): Promise<void> {
    await AsyncStorage.setItem('@profile', JSON.stringify(profile))
  },

  async get(): Promise<CachedProfile | null> {
    const raw = await AsyncStorage.getItem('@profile')
    if (!raw) return null
    try {
      return JSON.parse(raw) as CachedProfile
    } catch {
      await AsyncStorage.removeItem('@profile')
      return null
    }
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem('@profile')
  },
}

/**
 * One-way cleanup for releases that previously stored session tokens in
 * AsyncStorage. The values are deliberately discarded rather than migrated:
 * plaintext legacy tokens must not be copied into the new vault because a
 * potentially exposed session should be re-authenticated and rotated.
 */
export async function purgeLegacyPlaintextSession(): Promise<void> {
  await AsyncStorage.multiRemove([
    'accessToken',
    'refreshToken',
    'user',
    '@secure:tokens',
  ])
}
