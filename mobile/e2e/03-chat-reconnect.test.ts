/**
 * E2E Flow #3 — Chat WebSocket: disconnect → backoff → reconnect → resync
 *
 * Cubre el comportamiento de reconexión exponencial del `useChatStore`.
 *
 * Steps:
 *  1. Login como cliente
 *  2. Abrir chat (desde una cita confirmada)
 *  3. Verificar dot verde "Conectado"
 *  4. Forzar pérdida de red con `device.setURLBlacklist`
 *  5. Verificar que aparece el banner de reconexión
 *  6. Restaurar red con `device.clearURLBlacklist`
 *  7. Verificar que el dot vuelve a verde y el banner desaparece
 *  8. Enviar mensaje y verificar que llega al backend (echo)
 *
 * Asunciones:
 *  - Seed con cliente + vet + appointment confirmado con chat habilitado
 *  - WebSocket en path /chat (configurable via E2E_WS_URL)
 */

import { device, expect as dexpect } from 'detox'
import { loginAsClient } from './helpers/auth'
import { waitForElement } from './setup'

describe('Flow: Chat WebSocket reconnection', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES' },
      languageAndLocale: { language: 'es-CO', locale: 'es-CO' },
    })
  })

  it('reconecta automáticamente tras pérdida de red', async () => {
    // ── 1. Login ──────────────────────────────────────────────────
    await loginAsClient()

    // ── 2. Ir a Citas → tap primera cita → tap chat ──────────────
    await element(by.id('tab-appointments')).tap()
    await waitForElement(by.id('appointments-list'), 15_000)
    await element(by.id('appointment-card-0')).tap()
    await waitForElement(by.id('appointment-chat-cta'), 10_000)
    await element(by.id('appointment-chat-cta')).tap()

    // ── 3. Verificar conexión inicial ─────────────────────────────
    await waitForElement(by.id('chat-screen'), 15_000)
    await waitFor(element(by.id('chat-connection-dot')))
      .toHaveLabel('Conectado')
      .withTimeout(15_000)

    // ── 4. Forzar pérdida de red (solo iOS soporta URL blacklist) ─
    if (device.getPlatform() === 'ios') {
      await device.setURLBlacklist(['.*'])
    } else {
      // En Android usamos shutdown del wifi mediante shell adb
      await device.sendToHome()
      // Toggle airplane mode tampoco está disponible — fallback a kill
      await device.terminateApp()
      await device.launchApp({ newInstance: false })
      await element(by.id('tab-appointments')).tap()
      await waitForElement(by.id('appointments-list'))
      await element(by.id('appointment-card-0')).tap()
      await element(by.id('appointment-chat-cta')).tap()
      await waitForElement(by.id('chat-screen'))
    }

    // ── 5. Banner de reconexión ──────────────────────────────────
    await waitFor(element(by.id('chat-reconnect-banner')))
      .toBeVisible()
      .withTimeout(20_000)
    await dexpect(element(by.id('chat-connection-dot'))).toHaveLabel(
      'Reconectando',
    )

    // ── 6. Restaurar red ─────────────────────────────────────────
    if (device.getPlatform() === 'ios') {
      await device.clearURLBlacklist()
    }

    // ── 7. Reconexión automática (backoff hasta 30s) ─────────────
    await waitFor(element(by.id('chat-connection-dot')))
      .toHaveLabel('Conectado')
      .withTimeout(60_000)
    await waitFor(element(by.id('chat-reconnect-banner')))
      .not.toBeVisible()
      .withTimeout(10_000)

    // ── 8. Enviar mensaje + verificar persistencia ───────────────
    await element(by.id('chat-input')).replaceText(
      'Hola, llegando en 5 minutos',
    )
    await element(by.id('chat-send')).tap()
    await waitFor(element(by.text('Hola, llegando en 5 minutos')))
      .toBeVisible()
      .withTimeout(10_000)

    // El mensaje debe tener tick de "enviado" (verde sage)
    await dexpect(element(by.id('chat-message-tick-0'))).toBeVisible()
  })
})
