import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from 'react'
import { NativeModules, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { Locale, Translations } from './types'
import esCO from './locales/es-CO'
import enUS from './locales/en-US'

/**
 * Sistema de internacionalización mínimo, type-safe, sin dependencias externas.
 *
 * Capacidades:
 *  - Auto-detect del locale del device usando NativeModules (sin react-native-localize)
 *  - Persistencia de override del usuario en AsyncStorage
 *  - Hook `useI18n()` que devuelve `t(key, params?)` y `switchLocale(locale)`
 *  - Interpolación con `{name}`, `{count}` (regex simple)
 *  - Fallback al key si no encuentra la traducción → fácil debugging
 *
 * El provider re-renderiza el árbol cuando cambia el locale; React Query
 * y Zustand stores no se afectan.
 */

const STORAGE_KEY = '@nvet:locale'
const DEFAULT_LOCALE: Locale = 'es-CO'

const TRANSLATIONS: Record<Locale, Translations> = {
  'es-CO': esCO,
  'en-US': enUS,
}

interface I18nContextValue {
  locale: Locale
  t: (key: string, params?: Record<string, string | number>) => string
  switchLocale: (locale: Locale) => void
  isReady: boolean
  /** Locales disponibles (para LanguageSwitcher) */
  availableLocales: Array<{ code: Locale; nativeName: string }>
}

const I18nContext = createContext<I18nContextValue | null>(null)

/**
 * Detecta el locale preferido del device.
 *
 * iOS: `NativeModules.SettingsManager.settings.AppleLocale` o `AppleLanguages[0]`
 * Android: `NativeModules.I18nManager.localeIdentifier`
 *
 * Si no se puede detectar o no es un locale soportado, retorna `es-CO`.
 */
function detectDeviceLocale(): Locale {
  try {
    let raw: string | undefined

    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings
      raw =
        settings?.AppleLocale ||
        (settings?.AppleLanguages && settings.AppleLanguages[0])
    } else if (Platform.OS === 'android') {
      raw = NativeModules.I18nManager?.localeIdentifier
    }

    if (!raw) return DEFAULT_LOCALE

    // Normalize: en_US → en-US, es-419 → es-CO, en-GB → en-US
    const normalized = raw.replace('_', '-').toLowerCase()
    if (normalized.startsWith('en')) return 'en-US'
    return 'es-CO' // default to Colombia for any es-* o cualquier otro locale
  } catch {
    return DEFAULT_LOCALE
  }
}

/**
 * Resuelve `auth.login.title` a la string final, navegando el árbol.
 */
function resolveKey(
  translations: Translations,
  key: string,
): string | undefined {
  const parts = key.split('.')
  let current: any = translations
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * Reemplaza `{name}` por `params.name` en la string.
 */
function interpolate(
  str: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] != null ? String(params[k]) : `{${k}}`,
  )
}

interface ProviderProps {
  children: ReactNode
}

export function I18nProvider({ children }: ProviderProps) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [isReady, setIsReady] = useState(false)

  // Cargar preferencia o detectar al montar
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null
        if (stored === 'es-CO' || stored === 'en-US') {
          if (mounted) setLocale(stored)
        } else {
          const detected = detectDeviceLocale()
          if (mounted) setLocale(detected)
        }
      } catch {
        // Silently fall back al default (ya está seteado)
      } finally {
        if (mounted) setIsReady(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const switchLocale = useCallback(async (next: Locale) => {
    setLocale(next)
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Si falla la persistencia, mantenemos el cambio en memoria
    }
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = resolveKey(TRANSLATIONS[locale], key)
      if (!value) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn(`[i18n] Missing translation for key: ${key}`)
        }
        return key // fallback visible para debugging
      }
      return interpolate(value, params)
    },
    [locale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t,
      switchLocale,
      isReady,
      availableLocales: [
        { code: 'es-CO', nativeName: 'Español (CO)' },
        { code: 'en-US', nativeName: 'English (US)' },
      ],
    }),
    [locale, t, switchLocale, isReady],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Hook principal del sistema i18n.
 *
 * Uso:
 *   const { t, locale, switchLocale } = useI18n()
 *   <Text>{t('auth.login.title')}</Text>
 *   <Text>{t('greeting', { name: 'María' })}</Text>
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return ctx
}
