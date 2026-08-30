/**
 * Helpers de autenticación para flujos E2E.
 *
 * Los flujos usan el contrato de accesibilidad real de la app en lugar de
 * testIDs que no existen en las pantallas productivas. Esto mantiene Detox
 * alineado con la misma superficie que usan lectores de pantalla.
 *
 * Las credenciales se leen de env vars o de defaults para entorno staging.
 * NO uses estos helpers en producción — los emails/passwords son fixtures
 * que solo existen en el seed del entorno de test.
 */

import { waitForElement } from '../setup'

const FIXTURES = {
  client: {
    email: process.env.E2E_CLIENT_EMAIL ?? 'cliente@nvetcare.test',
    password: process.env.E2E_CLIENT_PASSWORD ?? 'TestClient123!',
  },
  vet: {
    email: process.env.E2E_VET_EMAIL ?? 'vet@nvetcare.test',
    password: process.env.E2E_VET_PASSWORD ?? 'TestVet123!',
  },
}

export async function loginAs(role: 'client' | 'vet') {
  const creds = FIXTURES[role]

  const emailInput = element(by.label('Correo electrónico'))
  const passwordInput = element(by.label('Contraseña'))

  await waitForElement(by.label('Correo electrónico'), 30_000)
  await emailInput.replaceText(creds.email)
  await passwordInput.replaceText(creds.password)
  await element(by.label('Iniciar sesión')).tap()

  // RootNavigator cambia de stack cuando /auth/me refleja la sesión.
  const targetLabel = role === 'client' ? 'Pantalla de inicio' : 'Panel veterinario'
  await waitForElement(by.label(targetLabel), 20_000)
}

export async function loginAsClient() {
  return loginAs('client')
}

export async function loginAsVet() {
  return loginAs('vet')
}

export async function logout() {
  await element(by.label('Mi perfil')).tap()
  await waitForElement(by.label('Cerrar sesión'))
  await element(by.label('Cerrar sesión')).tap()
  await waitForElement(by.text('Cerrar sesión'))
  await element(by.text('Cerrar sesión').and(by.type('_UIAlertControllerActionView'))).tap()
  await waitForElement(by.label('Correo electrónico'), 15_000)
}
