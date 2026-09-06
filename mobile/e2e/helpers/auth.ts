/**
 * Helpers de autenticación para flujos E2E.
 *
 * Los flujos usan el contrato de accesibilidad real de la app en lugar de
 * testIDs que no existen en las pantallas productivas. Esto mantiene Detox
 * alineado con la misma superficie que usan lectores de pantalla.
 *
 * Las credenciales son obligatorias y proceden de la sesión staging certificada.
 * No existen defaults locales: un gate de certificación nunca debe continuar con
 * identidades implícitas o potencialmente desincronizadas.
 */

import { waitForElement } from '../setup'

function requiredFixture(name: string): string {
  const value = process.env[name]
  if (!value?.trim()) {
    throw new Error(`Missing required Detox fixture variable: ${name}`)
  }
  return value
}

const FIXTURES = {
  client: {
    email: requiredFixture('E2E_CLIENT_EMAIL'),
    password: requiredFixture('E2E_CLIENT_PASSWORD'),
  },
  vet: {
    email: requiredFixture('E2E_VET_EMAIL'),
    password: requiredFixture('E2E_VET_PASSWORD'),
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
