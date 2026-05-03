/**
 * Tests de la lógica pura del sistema i18n.
 *
 * Replicamos las funciones internas del provider (resolveKey, interpolate)
 * para testear su comportamiento sin necesidad de montar React.
 */

import esCO from '../../src/i18n/locales/es-CO'
import { Translations } from '../../src/i18n/types'

function resolveKey(translations: Translations, key: string): string | undefined {
  const parts = key.split('.')
  let current: any = translations
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return typeof current === 'string' ? current : undefined
}

function interpolate(
  str: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] != null ? String(params[k]) : `{${k}}`,
  )
}

describe('i18n: resolveKey', () => {
  it('resolves a simple key', () => {
    expect(resolveKey(esCO, 'common.cancel')).toBe('Cancelar')
  })

  it('resolves a nested key', () => {
    expect(resolveKey(esCO, 'auth.login.submit')).toBe('Iniciar sesión')
  })

  it('resolves a deeply nested key', () => {
    expect(resolveKey(esCO, 'profile.menu.wallet')).toBe('Mi billetera')
  })

  it('returns undefined for missing keys', () => {
    expect(resolveKey(esCO, 'auth.login.nonexistent')).toBeUndefined()
    expect(resolveKey(esCO, 'totally.fake.path')).toBeUndefined()
  })

  it('returns undefined when path leads to an object instead of string', () => {
    // 'auth.login' is an object, not a leaf string
    expect(resolveKey(esCO, 'auth.login')).toBeUndefined()
  })

  it('handles empty key gracefully', () => {
    expect(resolveKey(esCO, '')).toBeUndefined()
  })
})

describe('i18n: interpolate', () => {
  it('returns original string when no params', () => {
    expect(interpolate('Hola mundo')).toBe('Hola mundo')
  })

  it('replaces a single param', () => {
    expect(interpolate('Hola {name}', { name: 'María' })).toBe('Hola María')
  })

  it('replaces multiple params', () => {
    expect(
      interpolate('{count} {item}', { count: 5, item: 'citas' }),
    ).toBe('5 citas')
  })

  it('keeps unmatched placeholders as-is for visibility in dev', () => {
    expect(interpolate('Hola {name}', {})).toBe('Hola {name}')
    expect(interpolate('Hola {name}', { other: 'foo' })).toBe('Hola {name}')
  })

  it('coerces number values to strings', () => {
    expect(interpolate('{n}', { n: 0 })).toBe('0')
    expect(interpolate('{n}', { n: 42 })).toBe('42')
  })

  it('handles strings with no placeholders + params provided', () => {
    expect(interpolate('Static text', { name: 'María' })).toBe('Static text')
  })
})

describe('i18n: locale normalization', () => {
  // Replica la lógica de detectDeviceLocale sin necesidad de NativeModules
  function normalizeLocale(raw: string | undefined): 'es-CO' | 'en-US' {
    if (!raw) return 'es-CO'
    const normalized = raw.replace('_', '-').toLowerCase()
    if (normalized.startsWith('en')) return 'en-US'
    return 'es-CO'
  }

  it('normalizes en_US to en-US', () => {
    expect(normalizeLocale('en_US')).toBe('en-US')
  })

  it('normalizes en-GB to en-US', () => {
    expect(normalizeLocale('en-GB')).toBe('en-US')
  })

  it('keeps any es-* as es-CO', () => {
    expect(normalizeLocale('es_ES')).toBe('es-CO')
    expect(normalizeLocale('es-419')).toBe('es-CO')
    expect(normalizeLocale('es-MX')).toBe('es-CO')
    expect(normalizeLocale('es-CO')).toBe('es-CO')
  })

  it('falls back to es-CO for unknown locales', () => {
    expect(normalizeLocale('fr-FR')).toBe('es-CO')
    expect(normalizeLocale('pt-BR')).toBe('es-CO')
    expect(normalizeLocale('')).toBe('es-CO')
    expect(normalizeLocale(undefined)).toBe('es-CO')
  })
})
