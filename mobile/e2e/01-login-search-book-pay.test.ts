/**
 * E2E Flow #1 — Cliente: login → buscar vet → reservar → pagar con CTG
 *
 * Cubre el "happy path" del cliente, el flujo más crítico del producto.
 *
 * Steps:
 *  1. Login con credenciales de cliente
 *  2. Bottom tab "Search" → ver lista de veterinarios
 *  3. Tap en el primer vet → VetDetailsScreen
 *  4. Tap en "Reservar cita" → BookAppointmentScreen
 *  5. Stepper paso 1: seleccionar servicio
 *  6. Stepper paso 2: seleccionar fecha + hora
 *  7. Stepper paso 3: seleccionar mascota (asume seed con al menos 1 pet)
 *  8. Stepper paso 4: seleccionar método CTG → tap "Reservar y pagar"
 *  9. Verificar pantalla de éxito + redirección a "Mis citas"
 *
 * Asunciones del entorno:
 *  - Backend en E2E_API_URL (default http://localhost:3000)
 *  - Seed con cliente + vet + pet + saldo CTG suficiente
 *  - Vet con tier ELITE para que aparezca primero en search
 */

import { device, expect as dexpect } from 'detox'
import { loginAsClient } from './helpers/auth'
import { waitForElement } from './setup'

describe('Flow: Cliente reserva cita con CTG', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES', location: 'always' },
      languageAndLocale: { language: 'es-CO', locale: 'es-CO' },
    })
  })

  it('completa el flujo end-to-end', async () => {
    // ── 1. Login ──────────────────────────────────────────────────
    await loginAsClient()

    // ── 2. Navegar a Search tab ───────────────────────────────────
    await element(by.id('tab-search')).tap()
    await waitForElement(by.id('search-input'))

    // ── 3. Esperar lista poblada y tap primer vet ─────────────────
    await waitForElement(by.id('vet-card-0'), 15_000)
    await element(by.id('vet-card-0')).tap()
    await waitForElement(by.id('vet-details-cta-book'), 10_000)

    // ── 4. Tap "Reservar cita" ────────────────────────────────────
    await element(by.id('vet-details-cta-book')).tap()
    await waitForElement(by.id('booking-step-1'))

    // ── 5. Paso 1: servicio ───────────────────────────────────────
    await element(by.id('booking-service-0')).tap()
    await element(by.id('booking-continue')).tap()
    await waitForElement(by.id('booking-step-2'))

    // ── 6. Paso 2: fecha + hora ──────────────────────────────────
    // Tap día actual (índice 0 del strip de 14 días)
    await element(by.id('booking-day-0')).tap()
    // El primer slot disponible de mañana
    await waitForElement(by.id('booking-slot-morning-0'), 5_000).catch(async () => {
      // Si no hay slots de mañana, intentar tarde
      await element(by.id('booking-slot-afternoon-0')).tap()
    })
    await element(by.id('booking-slot-morning-0'))
      .tap()
      .catch(() => element(by.id('booking-slot-afternoon-0')).tap())
    await element(by.id('booking-continue')).tap()
    await waitForElement(by.id('booking-step-3'))

    // ── 7. Paso 3: mascota + dirección ────────────────────────────
    await element(by.id('booking-pet-0')).tap()
    await element(by.id('booking-address-input')).replaceText(
      'Calle 100 # 8-50, Bogotá',
    )
    await element(by.id('booking-continue')).tap()
    await waitForElement(by.id('booking-step-4'))

    // ── 8. Paso 4: pago con CTG ───────────────────────────────────
    await waitForElement(by.id('payment-method-CTG'), 5_000)
    await element(by.id('payment-method-CTG')).tap()
    await element(by.id('booking-confirm')).tap()

    // ── 9. Pantalla de éxito + redirección ────────────────────────
    await waitForElement(by.id('booking-success'), 30_000)
    await dexpect(element(by.id('booking-success-confirm-id'))).toBeVisible()

    // Tap "Ver mis citas" → navega a tab Citas
    await element(by.id('booking-success-cta-view')).tap()
    await waitForElement(by.id('appointments-list'), 10_000)

    // La cita recién creada debe aparecer al inicio
    await dexpect(element(by.id('appointment-card-0'))).toBeVisible()
  })
})
