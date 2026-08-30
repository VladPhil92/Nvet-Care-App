/**
 * E2E Flow #3 — Chat WebSocket: conexión, recuperación y envío
 *
 * Android certifica reconexión después de reiniciar el proceso y volver a
 * abrir el chat mediante el deep link soportado por la app. iOS conserva la
 * prueba de pérdida/restauración de red con URL blacklist cuando exista el
 * proyecto nativo iOS.
 *
 * Asunciones:
 *  - Seed con una cita CONFIRMED de id fijo para cliente + vet E2E
 *  - El deep link nvetcare://chat/:appointmentId está registrado
 */

import { device, expect as dexpect } from 'detox'
import { loginAsClient } from './helpers/auth'
import { waitForElement } from './setup'

const CONFIRMED_APPOINTMENT_ID = '00000000-0000-4000-8000-000000000202'
const CHAT_URL = `nvetcare://chat/${CONFIRMED_APPOINTMENT_ID}`

describe('Flow: Chat WebSocket connectivity', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES' },
      languageAndLocale: { language: 'es-CO', locale: 'es-CO' },
    })
  })

  it('conecta, recupera sesión y persiste un mensaje', async () => {
    // 1. Login y apertura del chat confirmado mediante deep link en caliente.
    await loginAsClient()
    await device.launchApp({ newInstance: false, url: CHAT_URL })

    await waitForElement(by.text('Chat'), 15_000)
    await waitFor(element(by.label('En vivo')))
      .toBeVisible()
      .withTimeout(15_000)

    if (device.getPlatform() === 'ios') {
      // iOS permite bloquear URLs en runtime: aquí sí certificamos pérdida real.
      await device.setURLBlacklist(['.*'])
      await waitFor(element(by.text('Reconectando…')))
        .toBeVisible()
        .withTimeout(20_000)
      await dexpect(element(by.label('Reconectando'))).toBeVisible()

      await device.setURLBlacklist([])
      await waitFor(element(by.label('En vivo')))
        .toBeVisible()
        .withTimeout(60_000)
    } else {
      // Android no ofrece URL blacklist equivalente en Detox. Certificamos que
      // la sesión persiste y el socket vuelve a conectar tras reiniciar proceso.
      await device.terminateApp()
      await device.launchApp({ newInstance: true })
      await device.launchApp({ newInstance: false, url: CHAT_URL })
      await waitForElement(by.text('Chat'), 15_000)
      await waitFor(element(by.label('En vivo')))
        .toBeVisible()
        .withTimeout(30_000)
    }

    // 2. Enviar mensaje y verificar que reaparece en la conversación.
    const message = `E2E chat ${Date.now()}`
    await element(by.label('Mensaje a enviar')).replaceText(message)
    await element(by.label('Enviar mensaje')).tap()
    await waitFor(element(by.text(message)))
      .toBeVisible()
      .withTimeout(15_000)

    await dexpect(element(by.label('En vivo'))).toBeVisible()
  })
})
