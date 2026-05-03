/**
 * Helpers de autenticación para flujos E2E.
 *
 * Centralizan los pasos de login para que cada spec sea declarativo:
 *
 *   import { loginAsClient, loginAsVet } from './helpers/auth'
 *   await loginAsClient()
 *
 * Las credenciales se leen de env vars o de defaults para entorno staging.
 * NO uses estos helpers en producción — los emails/passwords son fixtures
 * que solo existen en el seed del entorno de test.
 */

import { fillInput, waitForElement } from '../setup'

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

  await waitForElement(by.id('login-email'), 30_000)
  await fillInput('login-email', creds.email)
  await fillInput('login-password', creds.password)
  await element(by.id('login-submit')).tap()

  // Tras login exitoso, el RootNavigator detecta auth y monta el stack del role.
  // Para CLIENT esperamos el bottom tab "home"; para VET el "dashboard".
  const targetTestId = role === 'client' ? 'tab-home' : 'tab-vet-dashboard'
  await waitForElement(by.id(targetTestId), 20_000)
}

export async function loginAsClient() {
  return loginAs('client')
}

export async function loginAsVet() {
  return loginAs('vet')
}

export async function logout() {
  await element(by.id('tab-profile')).tap()
  await waitForElement(by.id('profile-logout'))
  await element(by.id('profile-logout')).tap()
  // Confirmación destructive
  await waitForElement(by.text('Cerrar sesión'))
  await element(by.text('Cerrar sesión').and(by.type('_UIAlertControllerActionView'))).tap()
  // Tras logout, vuelve a Login
  await waitForElement(by.id('login-email'), 15_000)
}
