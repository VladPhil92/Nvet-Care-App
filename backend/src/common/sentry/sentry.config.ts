/**
 * Configuración de Sentry para el backend NestJS.
 *
 * - Inicialización debe ocurrir lo más temprano posible en el bootstrap
 *   (idealmente antes de instanciar la app de Nest) para capturar
 *   errores en módulos.
 * - `tracesSampleRate`: 100% en dev, 10% en prod para no saturar cuota.
 * - `profilesSampleRate`: 10% en prod (perfilado de CPU).
 * - `beforeSend`: hook para filtrar errores no relevantes (404, validación).
 *
 * En desarrollo o cuando `SENTRY_DSN` no está configurado, todas las
 * funciones son no-op para no agregar overhead.
 */

let sentryInitialized = false

export function initSentry() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    return false
  }

  // Carga lazy: si SENTRY_DSN no está configurado, ni siquiera importamos el SDK
  // (evita peso del bundle en dev local sin Sentry)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/node')

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || '1.0.0',

    // Sampling
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

    // No enviar PII automáticamente
    sendDefaultPii: false,

    // Filtrar errores no relevantes
    beforeSend(event: any, hint: any) {
      const error = hint?.originalException as
        | (Error & { status?: number; statusCode?: number })
        | undefined

      // Ignorar errores 4xx que son responsabilidad del cliente
      if (error) {
        const status = error.status ?? error.statusCode
        if (typeof status === 'number' && status >= 400 && status < 500) {
          // Mantener 401/403 para detectar attacks; ignorar 404/422/etc.
          if (status !== 401 && status !== 403) return null
        }
      }

      // Eliminar headers sensibles de la request si llegaron
      if (event.request?.headers) {
        delete event.request.headers.authorization
        delete event.request.headers.cookie
      }
      return event
    },

    // Fingerprint custom: agrupar errores similares
    integrations: [
      // HTTP integration auto-capture transactions
      new Sentry.Integrations.Http({ tracing: true }),
    ],
  })

  sentryInitialized = true
  return true
}

export function isSentryEnabled(): boolean {
  return sentryInitialized
}

/**
 * Helper seguro para capturar excepciones.
 * No-op si Sentry no está inicializado.
 */
export function captureException(
  error: Error,
  context?: { user?: { id: string; email?: string }; extra?: Record<string, unknown>; tags?: Record<string, string> },
) {
  if (!sentryInitialized) return
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/node')

  Sentry.withScope((scope: any) => {
    if (context?.user) {
      scope.setUser({ id: context.user.id, email: context.user.email })
    }
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) {
        scope.setTag(k, v)
      }
    }
    if (context?.extra) {
      scope.setExtras(context.extra)
    }
    Sentry.captureException(error)
  })
}
