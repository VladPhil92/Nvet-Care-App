/**
 * MSW server para tests Node (jest).
 *
 * Para uso en navegadores (browser-based testing) usar setupWorker
 * desde 'msw/browser' en lugar de setupServer.
 */

import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)

/**
 * Helper para incluir en globalSetup de jest:
 *   server.listen({ onUnhandledRequest: 'warn' })
 *
 * Llama a `server.resetHandlers()` después de cada test para limpiar
 * overrides per-test.
 */
export { handlers, FIXTURES } from './handlers'
