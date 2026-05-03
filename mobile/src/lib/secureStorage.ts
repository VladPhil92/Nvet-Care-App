/**
 * SecureStorage — almacenamiento de tokens sensibles con keychain nativo.
 *
 * Por qué no usamos AsyncStorage para tokens:
 *   - AsyncStorage almacena en `NSUserDefaults` (iOS) o `SharedPreferences` (Android)
 *     que NO están cifrados y son leíbles por cualquier app con acceso al sandbox.
 *   - Tokens robados → atacante puede impersonar al usuario completo.
 *
 * Por qué usamos Keychain:
 *   - iOS Keychain: cifrado con la clave del Secure Enclave del dispositivo
 *   - Android Keystore: hardware-backed key cuando está disponible
 *   - Resistente a ataques en dispositivos rooted/jailbroken
 *
 * Estrategia:
 *   - Tokens (access + refresh): Keychain
 *   - User profile (cache): AsyncStorage (no sensible, mejora UX offline)
 *   - 2FA secret encriptado intermedio: SessionStorage en memoria (nunca persistido)
 *
 * Fallback: si `react-native-keychain` no está disponible (e.g. tests jest),
 * se usa AsyncStorage con prefijo `@secure:` (NO seguro, solo para dev/test).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Interfaz del Keychain — definida aquí para no requerir import en tests.
 * En runtime real, importamos `react-native-keychain` solo si está disponible.
 */
type KeychainModule = {
  setGenericPassword: (
    username: string,
    password: string,
    options?: {
      service?: string
      accessControl?: string
      accessible?: string
    },
  ) => Promise<unknown>
  getGenericPassword: (options?: {
    service?: string
  }) => Promise<{ username: string; password: string } | false>
  resetGenericPassword: (options?: { service?: string }) => Promise<boolean>
  ACCESSIBLE: Record<string, string>
  ACCESS_CONTROL: Record<string, string>
}

const SERVICE = 'com.nvetcare.tokens'
const FALLBACK_PREFIX = '@secure:'

let keychainModule: KeychainModule | null | undefined

/**
 * Lazy load del módulo. Returns null si no está disponible (e.g. en jest).
 */
function getKeychain(): KeychainModule | null {
  if (keychainModule !== undefined) return keychainModule
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    keychainModule = require('react-native-keychain') as KeychainModule
    return keychainModule
  } catch {
    keychainModule = null
    return null
  }
}

interface TokenBundle {
  accessToken: string
  refreshToken: string
}

export const secureStorage = {
  /**
   * Guarda los tokens en el keychain con la cuenta como `username`.
   * Si keychain no está disponible, hace fallback a AsyncStorage.
   */
  async setTokens(tokens: TokenBundle): Promise<void> {
    const kc = getKeychain()
    const payload = JSON.stringify(tokens)

    if (kc) {
      await kc.setGenericPassword('nvetcare-user', payload, {
        service: SERVICE,
        // ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY:
        //  - Solo accesible tras el primer unlock del dispositivo
        //  - No se sincroniza a iCloud / otros devices del usuario
        accessible: kc.ACCESSIBLE?.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      })
      return
    }
    await AsyncStorage.setItem(`${FALLBACK_PREFIX}tokens`, payload)
  },

  /**
   * Lee los tokens del keychain. Returns null si no hay sesión activa.
   */
  async getTokens(): Promise<TokenBundle | null> {
    const kc = getKeychain()
    if (kc) {
      const result = await kc.getGenericPassword({ service: SERVICE })
      if (!result) return null
      try {
        return JSON.parse(result.password) as TokenBundle
      } catch {
        // payload corrupto, limpiar
        await this.clearTokens()
        return null
      }
    }
    const raw = await AsyncStorage.getItem(`${FALLBACK_PREFIX}tokens`)
    if (!raw) return null
    try {
      return JSON.parse(raw) as TokenBundle
    } catch {
      return null
    }
  },

  /**
   * Borra los tokens (logout o token revocado por el servidor).
   */
  async clearTokens(): Promise<void> {
    const kc = getKeychain()
    if (kc) {
      await kc.resetGenericPassword({ service: SERVICE })
      return
    }
    await AsyncStorage.removeItem(`${FALLBACK_PREFIX}tokens`)
  },

  /**
   * Acceso rápido al accessToken sin parsear todo el bundle.
   * Para usar en interceptors HTTP.
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.getTokens()
    return tokens?.accessToken ?? null
  },

  /**
   * Acceso rápido al refreshToken (usado por el refresh interceptor).
   */
  async getRefreshToken(): Promise<string | null> {
    const tokens = await this.getTokens()
    return tokens?.refreshToken ?? null
  },

  /**
   * Indica si la implementación actual es REALMENTE segura (keychain) o
   * fallback (AsyncStorage). El componente Settings puede mostrar warning si
   * `isSecure() === false` para alertar al usuario.
   */
  isSecure(): boolean {
    return getKeychain() !== null
  },
}

// =====================================================================
// Profile cache — AsyncStorage (no sensible)
// =====================================================================

/**
 * Cache del perfil del usuario para mostrar UI offline.
 * NO contiene credenciales, solo nombre/email/avatar.
 */
export const profileCache = {
  async set(profile: { id: string; email: string; firstName: string; lastName: string; avatar?: string | null }) {
    await AsyncStorage.setItem('@profile', JSON.stringify(profile))
  },
  async get(): Promise<{ id: string; email: string; firstName: string; lastName: string; avatar?: string } | null> {
    const raw = await AsyncStorage.getItem('@profile')
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },
  async clear(): Promise<void> {
    await AsyncStorage.removeItem('@profile')
  },
}
