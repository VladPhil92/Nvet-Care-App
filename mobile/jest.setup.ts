/**
 * Jest global setup para tests unit (no Detox).
 *
 * - Inicia el MSW server antes de cualquier test
 * - Resetea handlers entre tests para evitar leaks
 * - Cierra el server tras toda la suite
 *
 * Wired desde jest.config.js como `setupFilesAfterEach`.
 */

import { server } from './src/mocks/server'

// Polyfills mínimos para MSW en Node (sin browser globals)
if (typeof globalThis.fetch === 'undefined') {
  // En Node 18+ fetch es global; este check es defensivo para Node 16-
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const undici = require('undici')
  globalThis.fetch = undici.fetch as typeof fetch
  globalThis.Request = undici.Request as unknown as typeof Request
  globalThis.Response = undici.Response as unknown as typeof Response
  globalThis.Headers = undici.Headers as unknown as typeof Headers
}

beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'warn',
  })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

// Silenciar warnings de React Native que aparecen en tests pero no son relevantes
const origWarn = console.warn
console.warn = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (msg.includes('NativeAnimatedHelper') || msg.includes('act()')) return
  origWarn(...(args as Parameters<typeof console.warn>))
}
