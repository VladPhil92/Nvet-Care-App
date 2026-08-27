import { Component, ErrorInfo, ReactNode } from 'react'

/**
 * Error Boundary global del Dashboard.
 *
 * Captura errores no manejados en el árbol de componentes y muestra una
 * UI de fallback con la paleta oficial (Sage / Gold). Reporta el error
 * a `window.console` y, si está disponible, a `window.Sentry` o callback.
 *
 * Uso:
 *   <ErrorBoundary onError={...}>
 *     <App />
 *   </ErrorBoundary>
 */

interface Props {
  children: ReactNode
  /** Callback opcional para reportar a Sentry / monitoring. */
  onError?: (error: Error, info: ErrorInfo) => void
  /** Componente custom de fallback (override del default). */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode
}

interface State {
  error: Error | null
  errorInfo: ErrorInfo | null
}

const COLORS = {
  sage: '#5B7553',
  gold: '#C9A961',
  bg: '#FAFAF7',
  text: '#1F2A1B',
  muted: '#5F6B5A',
  border: '#E5E2D8',
} as const

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })

    // Log estructurado para debugging
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Captured:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    })

    // Hook para integración futura con Sentry
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Si Sentry está disponible globalmente, reportar
    const sentry = (window as unknown as { Sentry?: { captureException: (e: Error, ctx?: unknown) => void } }).Sentry
    if (sentry?.captureException) {
      sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } })
    }
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error, errorInfo } = this.state

    if (!error) return this.props.children

    // Custom fallback
    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.handleReset })
    }

    // Default fallback con marca Nvet Care
    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          backgroundColor: COLORS.bg,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 32,
            border: `1px solid ${COLORS.border}`,
            boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
          }}
        >
          {/* Icono con paleta oficial */}
          <div
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: `${COLORS.gold}1a`,
              border: `2px solid ${COLORS.gold}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
              fontSize: 28,
              color: COLORS.sage,
            }}
          >
            ⚠
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 600,
              color: COLORS.text,
              letterSpacing: '-0.01em',
            }}
          >
            Algo salió mal
          </h1>

          <p style={{ marginTop: 8, color: COLORS.muted, lineHeight: 1.5 }}>
            Encontramos un error inesperado. Nuestro equipo ha sido notificado.
            Puedes intentar reintentar la última acción o recargar la página.
          </p>

          {/* Detalles técnicos en desarrollo */}
          {import.meta.env.DEV && (
            <details
              style={{
                marginTop: 20,
                padding: 12,
                backgroundColor: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 500, color: COLORS.sage }}>
                Detalles técnicos (visible solo en desarrollo)
              </summary>
              <pre
                style={{
                  marginTop: 12,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  fontSize: 12,
                  color: COLORS.text,
                  maxHeight: 240,
                  overflow: 'auto',
                }}
              >
                {error.name}: {error.message}
                {'\n\n'}
                {error.stack}
                {errorInfo?.componentStack && '\n\nComponent stack:'}
                {errorInfo?.componentStack}
              </pre>
            </details>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: `1px solid ${COLORS.sage}`,
                backgroundColor: COLORS.sage,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: `1px solid ${COLORS.border}`,
                backgroundColor: '#fff',
                color: COLORS.text,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Recargar página
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
