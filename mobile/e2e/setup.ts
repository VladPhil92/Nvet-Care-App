/**
 * Setup compartido para los flujos Detox.
 *
 * Cada suite es responsable de lanzar la app con device.launchApp().
 * Los flujos de certificación actuales usan un clean slate por suite, por lo
 * que no hacemos reloadReactNative() global: si el arranque nativo falla, un
 * reload solo oculta la causa primaria con un segundo error de conexión.
 */

import { device } from 'detox'

/**
 * Helper expuesto para esperar elementos con timeout configurable.
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
 * Hace replaceText para garantizar idempotencia entre re-runs.
 */
export async function fillInput(testId: string, value: string) {
  const input = element(by.id(testId))
  await input.replaceText(value)
  // En Android, replaceText no siempre dispara onChangeText hasta blur.
  if (device.getPlatform() === 'android') {
    await input.tapReturnKey()
  }
}
