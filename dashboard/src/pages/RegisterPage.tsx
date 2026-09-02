import { FormEvent, useMemo, useState } from 'react'
import { T, F } from '../theme/tokens'
import { useAuthStore } from '../stores/useAuthStore'

type PublicRole = 'CLIENT' | 'VET'

interface RegisterPageProps {
  onLogin: () => void
}

const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]).{12,128}$/

export default function RegisterPage({ onLogin }: RegisterPageProps) {
  const [role, setRole] = useState<PublicRole>('CLIENT')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const { register, isLoading, error, clearError } = useAuthStore()

  const roleCopy = useMemo(
    () =>
      role === 'VET'
        ? 'Tu cuenta abrirá el Dashboard Veterinario. Podrás configurar agenda, tarifas y perfil desde el primer ingreso; la atención pública seguirá protegida por la verificación profesional.'
        : 'Tu cuenta abrirá el Dashboard de Usuario para gestionar mascotas, citas y servicios de Nvet Care.',
    [role],
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    clearError()
    setLocalError(null)

    if (password !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden.')
      return
    }

    if (!strongPassword.test(password)) {
      setLocalError(
        'La contraseña debe tener mínimo 12 caracteres e incluir mayúscula, minúscula, número y símbolo.',
      )
      return
    }

    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password,
        role,
      })
    } catch {
      // El store expone el error del backend.
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

  const labelStyle = {
    fontFamily: F.sans,
    fontSize: 11,
    fontWeight: 600,
    color: T.inkMuted,
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: T.canvas,
        padding: '28px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 620 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: F.serif, fontSize: 30, color: T.ink, marginBottom: 6 }}>
            Crear cuenta Nvet Care
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 13, color: T.inkMuted, lineHeight: 1.5 }}>
            Elige tu tipo de cuenta. Este rol define el dashboard que recibirás al iniciar sesión.
          </div>
        </div>

        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.line}`,
            borderRadius: 12,
            padding: '28px',
            boxShadow: '0 2px 12px rgba(13,27,42,.06)',
          }}
        >
          <div style={{ ...labelStyle, marginBottom: 10 }}>Tipo de cuenta</div>
          <div
            role="radiogroup"
            aria-label="Tipo de cuenta"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}
          >
            {([
              ['CLIENT', 'Usuario regular', 'Busco atención y servicios para mis mascotas'],
              ['VET', 'Veterinario', 'Soy profesional y atenderé desde Nvet Care'],
            ] as const).map(([value, title, description]) => {
              const selected = role === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    clearError()
                    setRole(value)
                  }}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 10,
                    border: `2px solid ${selected ? T.sage : T.line}`,
                    background: selected ? `${T.sage}0D` : T.surface,
                    color: T.ink,
                    cursor: 'pointer',
                    fontFamily: F.sans,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 5 }}>{title}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: T.inkMuted }}>{description}</div>
                </button>
              )
            })}
          </div>

          <div
            style={{
              marginTop: 12,
              marginBottom: 22,
              padding: '10px 12px',
              borderRadius: 8,
              background: T.surfaceAlt,
              fontFamily: F.sans,
              fontSize: 12,
              lineHeight: 1.55,
              color: T.inkSec,
            }}
          >
            {roleCopy}
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              <label style={labelStyle}>
                Nombre
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  minLength={2}
                  maxLength={50}
                  required
                  autoComplete="given-name"
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Apellido
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  minLength={2}
                  maxLength={50}
                  required
                  autoComplete="family-name"
                  style={inputStyle}
                />
              </label>
            </div>

            <label style={{ ...labelStyle, display: 'block', marginTop: 16 }}>
              Correo electrónico
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
              />
            </label>

            <label style={{ ...labelStyle, display: 'block', marginTop: 16 }}>
              Teléfono (opcional)
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+573001234567"
                autoComplete="tel"
                style={inputStyle}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 16 }}>
              <label style={labelStyle}>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Confirmar contraseña
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ marginTop: 8, fontFamily: F.sans, fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
              Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.
            </div>

            {(localError || error) && (
              <div
                role="alert"
                style={{
                  marginTop: 16,
                  padding: '10px 14px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: 8,
                  fontSize: 13,
                  color: T.err,
                  fontFamily: F.sans,
                }}
              >
                {localError || error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                marginTop: 20,
                border: 0,
                borderRadius: 8,
                padding: '11px 16px',
                background: T.sage,
                color: T.inkInv,
                fontFamily: F.sans,
                fontWeight: 700,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.55 : 1,
              }}
            >
              {isLoading ? 'Creando cuenta…' : role === 'VET' ? 'Crear cuenta veterinaria' : 'Crear cuenta de usuario'}
            </button>
          </form>

          <div
            style={{
              marginTop: 20,
              paddingTop: 18,
              borderTop: `1px solid ${T.line}`,
              textAlign: 'center',
              fontFamily: F.sans,
              fontSize: 13,
              color: T.inkMuted,
            }}
          >
            ¿Ya tienes cuenta?{' '}
            <button
              type="button"
              onClick={() => {
                clearError()
                onLogin()
              }}
              style={{
                border: 0,
                background: 'transparent',
                padding: 0,
                color: T.sage,
                fontFamily: F.sans,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Iniciar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
