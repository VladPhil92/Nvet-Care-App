/**
 * E2E Flow #1 — Cliente: login → buscar vet → reservar → pago por transferencia
 *
 * Cubre el happy path actualmente productizable del cliente. CTG y PSE se
 * mantienen deliberadamente fuera de este gate mientras la UI los marque como
 * métodos no disponibles.
 *
 * Asunciones del entorno:
 *  - Backend accesible en E2E_API_URL
 *  - Seed con cliente + vet ELITE + pet + agenda + precio
 *  - TRANSFER habilitado como método MVP
 */

import { device, expect as dexpect } from 'detox'
import { loginAsClient } from './helpers/auth'
import { waitForElement } from './setup'

describe('Flow: Cliente reserva cita con transferencia', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      permissions: { notifications: 'YES', location: 'always' },
      languageAndLocale: { language: 'es-CO', locale: 'es-CO' },
    })

    // Keep Android search deterministic. A headless emulator otherwise starts
    // with an arbitrary/default GPS position, which can legitimately filter
    // the Cartagena staging veterinarian out of the 20 km search radius.
    await device.setLocation(10.3997, -75.5144)
  })

  it('completa el flujo end-to-end productizable', async () => {
    // 1. Login
    await loginAsClient()

    // 2. Ir a Servicios. La tarjeta del fixture es una señal más fuerte de que
    // el stack y la búsqueda remota están listos que un heading puramente visual.
    await element(by.id('client-search-tab')).tap()
    // Wait for the geolocation-driven query to settle before selecting the
    // top-ranked result. VetCard exposes a stable testID because Android may
    // merge child Text nodes into the accessible Pressable, making by.text()
    // nondeterministic even when the card is visibly rendered.
    await waitForElement(by.id('vet-search-location-active'), 20_000)
    // The results list can begin below the fold on a Pixel 6 because the search
    // header carries two horizontal filter rails. Wait for the fixture to exist,
    // then scroll only as much as needed until the card is actually tappable.
    await waitFor(element(by.id('vet-search-result-0')))
      .toExist()
      .withTimeout(20_000)
    await waitFor(element(by.id('vet-search-result-0')))
      .toBeVisible()
      .whileElement(by.id('vet-search-results'))
      .scroll(180, 'down')

    // 3. Abrir el veterinario fixture (ELITE ranks first in the staging seed)
    await element(by.id('vet-search-result-0')).tap()
    await waitForElement(by.text('Perfil del veterinario'), 10_000)

    // 4. Iniciar reserva
    await element(by.text('Reservar cita')).tap()
    await waitForElement(by.text('¿Qué servicio necesitas?'))

    // 5. Servicio
    await waitForElement(by.text('Consulta general E2E'))
    await element(by.text('Consulta general E2E')).tap()
    await element(by.text('Continuar')).tap()
    await waitForElement(by.text('Selecciona el día'))

    // 6. Fecha + hora: usar mañana evita slots vencidos según hora de ejecución
    await element(by.text('Mañana')).tap()
    await waitForElement(by.text('08:00'), 10_000)
    await element(by.text('08:00')).tap()
    await element(by.text('Continuar')).tap()

    // 7. Mascota + dirección
    await waitForElement(by.text('¿Para cuál mascota?'))
    await element(by.text('Luna E2E')).tap()
    await element(by.label('Dirección de la visita')).replaceText(
      'Calle E2E 100, Cartagena',
    )
    await element(by.text('Continuar')).tap()

    // 8. Método productizable actual: TRANSFER
    await waitForElement(by.text('Resumen y pago'))
    await waitForElement(by.text('Transferencia'))
    await element(by.text('Transferencia')).tap()
    await element(by.text('Reservar y pagar')).tap()

    // 9. Confirmación real de la UI: hoy es un Alert, no una pantalla dedicada
    await waitForElement(by.text('¡Cita reservada! 🐾'), 30_000)
    await dexpect(element(by.text('Ver detalles'))).toBeVisible()
    await element(by.text('Volver al inicio')).tap()

    // 10. La cita queda registrada en el módulo de citas
    await waitForElement(by.id('client-appointments-tab'), 10_000)
    await element(by.id('client-appointments-tab')).tap()
    await waitForElement(by.text('Mis citas'), 10_000)
    await dexpect(element(by.text('Consulta general E2E')).atIndex(0)).toBeVisible()
  })
})
