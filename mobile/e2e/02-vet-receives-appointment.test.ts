/**
 * E2E Flow #2 — Veterinario recibe cita y la gestiona
 *
 * Cubre el flujo productivo actual del vet: PENDING → CONFIRMED →
 * IN_PROGRESS → COMPLETED, incluyendo las notas clínicas obligatorias.
 *
 * Asunciones del entorno:
 *  - Seed con una cita PENDING para hoy a las 20:00
 *  - El vet asignado coincide con E2E_VET_EMAIL
 */

import { device, expect as dexpect } from 'detox'
import { loginAsVet } from './helpers/auth'
import { waitForElement } from './setup'

describe('Flow: Vet recibe y procesa una cita', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      permissions: { notifications: 'YES', location: 'always' },
      languageAndLocale: { language: 'es-CO', locale: 'es-CO' },
    })
  })

  it('confirma → inicia → documenta → completa la cita', async () => {
    // 1. Login como vet
    await loginAsVet()

    // 2. Dashboard con la cita fixture de hoy
    await waitForElement(by.text('Agenda de hoy'), 15_000)
    const seededAppointment = element(
      by.label('Cita 20:00: Consulta general E2E con Cliente'),
    )
    await waitFor(seededAppointment).toBeVisible().withTimeout(10_000)
    await seededAppointment.tap()

    // 3. Detalle en estado PENDING
    await waitForElement(by.text('Cita en domicilio'))
    await dexpect(element(by.label('Por confirmar'))).toBeVisible()

    // 4. Confirmar
    await element(by.text('Confirmar cita')).tap()
    await waitForElement(by.text('Confirmar cita'), 5_000)
    await element(by.text('Confirmar')).tap()
    await waitFor(element(by.label('Confirmada')))
      .toBeVisible()
      .withTimeout(15_000)

    // 5. Iniciar visita; la ubicación en vivo aparece en IN_PROGRESS
    await element(by.text('Iniciar visita')).tap()
    await waitForElement(by.text('Iniciar visita'), 5_000)
    await element(by.text('Confirmar')).tap()
    await waitFor(element(by.label('En curso')))
      .toBeVisible()
      .withTimeout(15_000)
    await dexpect(element(by.text('Ubicación en vivo'))).toBeVisible()

    // 6. Completar exige diagnóstico y tratamiento
    await element(by.text('Completar cita')).tap()
    await waitForElement(by.text('Notas clínicas'), 5_000)

    // React Native Android expone TextInput como android.widget.EditText. Los
    // placeholders no son un selector Detox estable en esa plataforma, así que
    // usamos el orden determinista del modal. iOS conserva el matcher de texto
    // hasta que exista el proyecto nativo y podamos instrumentarlo por a11y.
    const diagnosisInput =
      device.getPlatform() === 'android'
        ? element(by.type('android.widget.EditText')).atIndex(0)
        : element(by.text('Ej: Dermatitis alérgica estacional'))
    const treatmentInput =
      device.getPlatform() === 'android'
        ? element(by.type('android.widget.EditText')).atIndex(1)
        : element(by.text('Ej: Antihistamínico oral 5mg/kg por 7 días'))

    await diagnosisInput.replaceText('Chequeo E2E sin hallazgos de alarma')
    await treatmentInput.replaceText('Seguimiento general y control en 7 días')
    await element(by.text('Guardar y completar cita')).tap()

    await waitFor(element(by.label('Completada')))
      .toBeVisible()
      .withTimeout(15_000)

    // 7. Regresar al dashboard y verificar que el estado persistió
    await device.pressBack()
    await waitForElement(by.text('Agenda de hoy'), 10_000)
    await dexpect(element(by.label('Completada'))).toBeVisible()
  })
})
