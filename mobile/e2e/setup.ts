/**
 * Setup ejecutado en cada test después de la inicialización de Detox.
 *
 * - Permite reset del estado de la app sin reinstalar (más rápido)
 * - En CI con DETOX_REUSE=0 reinstala la app por test (clean slate)
 * - Captura screenshots automáticamente en fallos cuando CI=true
 *
 * Si necesitas hooks específicos de un flow, agrégalos en el archivo
 * del test correspondiente con beforeEach/afterEach locales.
 */

import { device } from 'detox'

beforeAll(async () => {
  // No-op: device.launchApp se hace en globalSetup de detox/runners/jest
})

afterAll(async () => {
  // Cleanup global: detox global teardown se encarga
})

afterEach(async () => {
  // Si el test fallo, takeScreenshot se hace via plugin artifacts.
  // Aquí solo aseguramos un estado limpio para el siguiente test.
  if (process.env.DETOX_REUSE !== '1') {
    await device.reloadReactNative()
  }
})

/**
 * Helper expuesto globalmente para esperar elementos con timeout configurable.
 * Uso típico en tests:
 *   await waitForElement(by.id('home-greeting'))
 *   await waitForElement(by.id('book-success'), 30_000)
 */
export async function waitForElement(matcher: Detox.NativeMatcher, timeoutMs = 10_000) {
  await waitFor(element(matcher)).toBeVisible().withTimeout(timeoutMs)
}

/**
 * Helper para tap-and-wait: ejecuta tap y espera a que un elemento siguiente aparezca.
 */
export async function tapAndWait(
  tapMatcher: Detox.NativeMatcher,
  waitMatcher: Detox.NativeMatcher,
  timeoutMs = 10_000,
) {
  await element(tapMatcher).tap()
  await waitForElement(waitMatcher, timeoutMs)
}

/**
 * Helper para escribir texto en un input identificado por testID.
 * Hace clear + replaceText para garantizar idempotencia entre re-runs.
 */
export async function fillInput(testId: string, value: string) {
  const input = element(by.id(testId))
  await input.replaceText(value)
  // En Android, replaceText no siempre dispara onChangeText hasta blur.
  if (device.getPlatform() === 'android') {
    await input.tapReturnKey()
  }
}
