/**
 * Helpers de autenticación para flujos E2E.
 *
 * Los flujos usan el contrato de accesibilidad real de la app. Los campos de
 * credenciales tienen labels canónicos; el CTA de login está localizado por el
 * runtime, por lo que el matcher acepta explícitamente los dos locales soportados
 * por Nvet Care (es-CO / en-US) en vez de asumir el idioma del runner Android.
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

const LOGIN_SUBMIT_MATCHER = by
  .label('Iniciar sesión')
  .or(by.label('Sign in'))

export async function loginAs(role: 'client' | 'vet') {
  const creds = FIXTURES[role]

  const emailInput = element(by.label('Correo electrónico'))
  const passwordInput = element(by.label('Contraseña'))

  await waitForElement(by.label('Correo electrónico'), 30_000)
  await emailInput.replaceText(creds.email)
  await passwordInput.replaceText(creds.password)
  await waitForElement(LOGIN_SUBMIT_MATCHER)
  await element(LOGIN_SUBMIT_MATCHER).tap()

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
