import * as Sentry from '@sentry/react-native'

const sentryDsn = '__SENTRY_DSN_MOBILE__'.trim()

export const navigationIntegration = Sentry.reactNavigationIntegration({
  // Keep TTID disabled for the first commercial Android release. Route tracing
  // remains available without taking on the extra native display-timing surface.
  enableTimeToInitialDisplay: false,
})

const scrubHeaders = (headers?: Record<string, string>) => {
  if (!headers) return headers

  const clean = { ...headers }
  for (const key of Object.keys(clean)) {
    const normalized = key.toLowerCase()
    if (
      normalized === 'authorization' ||
      normalized === 'cookie' ||
      normalized === 'set-cookie' ||
      normalized === 'x-api-key'
    ) {
      delete clean[key]
    }
  }
  return clean
}

Sentry.init({
  dsn: sentryDsn || undefined,
  enabled: Boolean(sentryDsn),
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: false,
  tracesSampleRate: __DEV__ ? 0 : 0.1,
  integrations: [navigationIntegration],
  beforeSend(event) {
    // Nvet may handle veterinary, location, financial and chat context. Keep
    // observability useful while deliberately excluding payloads and identity
    // fields that are not required for crash diagnosis.
    if (event.user) {
      event.user = event.user.id ? { id: event.user.id } : undefined
    }

    if (event.request) {
      event.request.headers = scrubHeaders(event.request.headers)
      event.request.data = undefined
      event.request.cookies = undefined
    }

    event.extra = undefined

    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(breadcrumb => ({
        category: breadcrumb.category,
        type: breadcrumb.type,
        level: breadcrumb.level,
        message: breadcrumb.message,
        timestamp: breadcrumb.timestamp,
      }))
    }

    return event
  },
  beforeBreadcrumb(breadcrumb) {
    return {
      category: breadcrumb.category,
      type: breadcrumb.type,
      level: breadcrumb.level,
      message: breadcrumb.message,
      timestamp: breadcrumb.timestamp,
    }
  },
})
