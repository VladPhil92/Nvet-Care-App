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
      permissions: { notifications: 'YES', location: 'always' },
      languageAndLocale: { language: 'es-CO', locale: 'es-CO' },
    })
  })

  it('completa el flujo end-to-end productizable', async () => {
    // 1. Login
    await loginAsClient()

    // 2. Ir a Servicios y esperar búsqueda real
    await element(by.label('Servicios y veterinarios')).tap()
    await waitForElement(by.label('Buscar veterinarios'))

    // 3. Abrir el veterinario fixture
    await waitForElement(by.text('Dr. Veterinario E2E'), 15_000)
    await element(by.text('Dr. Veterinario E2E')).tap()
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
    await waitForElement(by.label('Mis citas'), 10_000)
    await element(by.label('Mis citas')).tap()
    await waitForElement(by.text('Mis citas'), 10_000)
    await dexpect(element(by.text('Consulta general E2E')).atIndex(0)).toBeVisible()
  })
})
