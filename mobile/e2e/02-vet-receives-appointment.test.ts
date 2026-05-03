/**
 * E2E Flow #2 — Veterinario recibe cita y la gestiona
 *
 * Cubre el flujo del lado del vet desde su dashboard.
 *
 * Steps:
 *  1. Login como vet
 *  2. Dashboard muestra cita PENDING en la lista de "Hoy"
 *  3. Tap en la cita → VetAppointmentDetail
 *  4. Tap "Confirmar cita" → status pasa a CONFIRMED
 *  5. Tap "Iniciar atención" → status pasa a IN_PROGRESS + ETA visible
 *  6. Tap "Marcar completada" → status pasa a COMPLETED
 *  7. Volver al dashboard → la cita ya no aparece en pendientes
 *
 * Asunciones del entorno:
 *  - Seed con un appointment pre-creado en status PENDING para hoy
 *  - El vet asignado coincide con E2E_VET_EMAIL
 */

import { device, expect as dexpect } from 'detox'
import { loginAsVet } from './helpers/auth'
import { waitForElement } from './setup'

describe('Flow: Vet recibe y procesa una cita', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES', location: 'always' },
      languageAndLocale: { language: 'es-CO', locale: 'es-CO' },
    })
  })

  it('confirma → inicia → completa la cita', async () => {
    // ── 1. Login como vet ─────────────────────────────────────────
    await loginAsVet()

    // ── 2. Dashboard con cita PENDING ─────────────────────────────
    await waitForElement(by.id('vet-dashboard-today-list'), 15_000)
    await waitForElement(by.id('vet-appointment-0'), 10_000)

    const firstAppointment = element(by.id('vet-appointment-0'))
    await dexpect(firstAppointment).toBeVisible()

    // ── 3. Tap → detail ───────────────────────────────────────────
    await firstAppointment.tap()
    await waitForElement(by.id('appointment-detail-screen'))
    await dexpect(element(by.id('appointment-status-badge'))).toHaveText('Pendiente')

    // ── 4. Confirmar ──────────────────────────────────────────────
    await element(by.id('appointment-action-confirm')).tap()
    // Confirmation alert
    await waitForElement(by.text('Confirmar cita'), 5_000)
    await element(by.text('Sí, confirmar')).tap()
    // Status badge cambia
    await waitFor(element(by.id('appointment-status-badge')))
      .toHaveText('Confirmada')
      .withTimeout(15_000)

    // ── 5. Iniciar atención ───────────────────────────────────────
    await element(by.id('appointment-action-start')).tap()
    await waitForElement(by.text('Iniciar atención'), 5_000)
    await element(by.text('Sí, iniciar')).tap()
    await waitFor(element(by.id('appointment-status-badge')))
      .toHaveText('En curso')
      .withTimeout(15_000)
    // ETA box debe ser visible solo en IN_PROGRESS
    await dexpect(element(by.id('appointment-eta-box'))).toBeVisible()

    // ── 6. Completar ──────────────────────────────────────────────
    await element(by.id('appointment-action-complete')).tap()
    await waitForElement(by.text('Marcar completada'), 5_000)
    await element(by.text('Sí, completar')).tap()
    await waitFor(element(by.id('appointment-status-badge')))
      .toHaveText('Completada')
      .withTimeout(15_000)

    // ── 7. Back al dashboard ──────────────────────────────────────
    await element(by.id('header-back')).tap()
    await waitForElement(by.id('vet-dashboard-today-list'), 5_000)
    // La cita ya no debe aparecer como pendiente (puede aparecer en histórico)
    await dexpect(
      element(by.id('vet-pending-empty')).or(
        element(by.id('vet-appointment-0')).withDescendant(
          by.id('status-completed'),
        ),
      ),
    ).toBeVisible()
  })
})
