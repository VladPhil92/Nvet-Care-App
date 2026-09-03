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
 * iOS no tiene proyecto nativo certificado todavía (track phase-14). Cuando
 * exista, deberá implementar la misma interfaz usando Keychain antes de
 * habilitar un release iOS.
 */

type TokenBundle = {
  accessToken: string
  refreshToken: string
}

type NativeSecureStorage = {
  setTokens(accessToken: string, refreshToken: string): Promise<void>
  getTokens(): Promise<TokenBundle | null>
  clearTokens(): Promise<void>
}

const nativeVault = NativeModules.NvetSecureStorage as NativeSecureStorage | undefined
let testTokens: TokenBundle | null = null

function isTestEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'test'
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
