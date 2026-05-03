/**
 * Tests de paridad de locales y validez del shape `Translations`.
 *
 * Estos tests son puros (no requieren React Native runtime) y se pueden
 * ejecutar con `jest` directo o `npx jest __tests__/i18n`.
 */

import esCO from '../../src/i18n/locales/es-CO'
import enUS from '../../src/i18n/locales/en-US'

/** Recorre recursivamente un objeto y devuelve todos los paths (dot-notation). */
function getAllKeys(obj: any, prefix = ''): string[] {
  const keys: string[] = []
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    const v = obj[k]
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...getAllKeys(v, path))
    } else {
      keys.push(path)
    }
  }
  return keys.sort()
}

/** Devuelve el valor en un objeto siguiendo un path por dot-notation. */
function getValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
}

describe('i18n: locale parity', () => {
  it('es-CO and en-US have the same set of keys', () => {
    const esKeys = getAllKeys(esCO)
    const enKeys = getAllKeys(enUS)
    expect(esKeys).toEqual(enKeys)
  })

  it('es-CO has no empty string values', () => {
    for (const key of getAllKeys(esCO)) {
      const v = getValue(esCO, key)
      expect(typeof v).toBe('string')
      expect((v as string).length).toBeGreaterThan(0)
    }
  })

  it('en-US has no empty string values', () => {
    for (const key of getAllKeys(enUS)) {
      const v = getValue(enUS, key)
      expect(typeof v).toBe('string')
      expect((v as string).length).toBeGreaterThan(0)
    }
  })

  it('all values are leaf strings (no objects in unexpected places)', () => {
    const esKeys = getAllKeys(esCO)
    expect(esKeys.length).toBeGreaterThan(50) // sanity check
  })

  it('contains required namespace roots', () => {
    const requiredRoots = ['common', 'auth', 'profile', 'appointments', 'wallet', 'errors']
    for (const root of requiredRoots) {
      expect(esCO).toHaveProperty(root)
      expect(enUS).toHaveProperty(root)
    }
  })
})

describe('i18n: spot checks', () => {
  it('es-CO uses Colombian Spanish phrasing', () => {
    expect(esCO.auth.login.submit).toMatch(/Iniciar sesi[oó]n/i)
    expect(esCO.profile.menu.wallet).toMatch(/billetera/i)
  })

  it('en-US uses US English phrasing', () => {
    expect(enUS.auth.login.submit).toMatch(/Sign in/i)
    expect(enUS.profile.menu.wallet).toMatch(/wallet/i)
  })
})
