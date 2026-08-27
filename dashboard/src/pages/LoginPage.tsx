import { useState, FormEvent } from 'react'
import { T, F } from '../theme/tokens'
import { Btn } from '../components/UI'
import { useAuthStore } from '../stores/useAuthStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, isLoading, error, clearError } = useAuthStore()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await login({ email, password })
    } catch {
      // error already set in store
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    background: T.surfaceAlt,
    border: `1px solid ${T.line}`,
    borderRadius: 8,
    color: T.ink,
    fontSize: 14,
    fontFamily: F.sans,
    marginTop: 6,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: T.canvas,
        padding: '24px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              fontFamily: F.serif,
              fontSize: 30,
              fontWeight: 300,
              color: T.ink,
              marginBottom: 6,
              letterSpacing: '-0.5px',
            }}
          >
            Nvet Care
          </div>
          <div
            style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: T.inkMuted,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
            }}
          >
            Panel de administración
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.line}`,
            borderRadius: 12,
            padding: '32px 28px',
            boxShadow: '0 2px 12px rgba(13,27,42,.06)',
          }}
        >
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.inkMuted,
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Correo electrónico
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@nvetcare.co"
                required
                autoComplete="email"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.inkMuted,
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Contraseña
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                style={inputStyle}
              />
            </div>

            {error && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  fontSize: 13,
                  color: T.err,
                  fontFamily: F.sans,
                }}
              >
                {error}
              </div>
            )}

            <Btn full disabled={isLoading} onClick={() => {}}>
              {isLoading ? 'Ingresando…' : 'Ingresar al panel'}
            </Btn>
          </form>
        </div>

        <div
          style={{
            textAlign: 'center',
            marginTop: 24,
            fontFamily: F.sans,
            fontSize: 12,
            color: T.inkMuted,
          }}
        >
          Acceso restringido · Solo personal autorizado Nvet
        </div>
      </div>
    </div>
  )
}
