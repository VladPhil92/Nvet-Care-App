import { FormEvent, useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '../services/api'
import { vetInvitationService } from '../services/vet-invitation.service'
import { useAuthStore } from '../stores/useAuthStore'
import { F, T } from '../theme/tokens'

interface VetInvitationRegisterPageProps {
  token: string
  onLogin: () => void
}

const strongPassword =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]).{12,128}$/

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? '', lastName: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export default function VetInvitationRegisterPage({
  token,
  onLogin,
}: VetInvitationRegisterPageProps) {
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    fullName: string
    email: string
    city: string
    expiresAt: string
    existingAccount: boolean
  } | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const { register, isLoading, error, clearError } = useAuthStore()

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoadingPreview(true)
      setPreviewError(null)
      try {
        const result = await vetInvitationService.preview(token)
        if (cancelled) return
        if (!result.valid || !result.fullName || !result.email || !result.market || !result.expiresAt) {
          setPreviewError('La invitación no es válida, ya fue utilizada o expiró.')
          setPreview(null)
          return
        }
        const names = splitName(result.fullName)
        setFirstName(names.firstName)
        setLastName(names.lastName)
        setPreview({
          fullName: result.fullName,
          email: result.email,
          city: result.market.city,
          expiresAt: result.expiresAt,
          existingAccount: Boolean(result.existingAccount),
        })
      } catch (err) {
        if (!cancelled) {
          setPreviewError(getErrorMessage(err))
        }
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [token])

  const expiryLabel = useMemo(() => {
    if (!preview?.expiresAt) return null
    return new Date(preview.expiresAt).toLocaleString()
  }, [preview?.expiresAt])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    clearError()
    setLocalError(null)
    if (!preview) return

    if (preview.existingAccount) {
      onLogin()
      return
    }
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setLocalError('Completa tu nombre y apellido antes de continuar.')
      return
    }
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
        email: preview.email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password,
        role: 'VET',
      })
    } catch {
      // The auth store exposes the server error.
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
        display: 'grid',
        placeItems: 'center',
        background: T.canvas,
        padding: '28px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 620 }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: F.serif, fontSize: 30, color: T.ink }}>
            Invitación profesional Nvet Care
          </div>
          <div
            style={{
              marginTop: 7,
              fontFamily: F.sans,
              fontSize: 13,
              lineHeight: 1.55,
              color: T.inkMuted,
            }}
          >
            Incorporación veterinaria con atribución segura al proceso de captación.
          </div>
        </div>

        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.line}`,
            borderRadius: 12,
            padding: 28,
            boxShadow: '0 2px 12px rgba(13,27,42,.06)',
          }}
        >
          {loadingPreview && (
            <div role="status" style={{ color: T.inkMuted, fontFamily: F.sans }}>
              Validando invitación…
            </div>
          )}

          {!loadingPreview && previewError && (
            <div>
              <div
                role="alert"
                style={{
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  color: T.err,
                  fontFamily: F.sans,
                  lineHeight: 1.5,
                }}
              >
                {previewError}
              </div>
              <button
                type="button"
                onClick={onLogin}
                style={{
                  marginTop: 16,
                  border: `1px solid ${T.line}`,
                  borderRadius: 8,
                  background: T.surface,
                  padding: '10px 14px',
                  color: T.ink,
                  fontFamily: F.sans,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Ir a iniciar sesión
              </button>
            </div>
          )}

          {!loadingPreview && preview && (
            <>
              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  background: `${T.sage}12`,
                  border: `1px solid ${T.sage}`,
                  fontFamily: F.sans,
                  lineHeight: 1.55,
                  marginBottom: 20,
                }}
              >
                <strong>{preview.fullName}</strong>, esta invitación corresponde a{' '}
                <strong>{preview.city}</strong>. El correo queda vinculado a{' '}
                <strong>{preview.email}</strong> y no puede cambiarse durante este flujo.
                {expiryLabel && (
                  <div style={{ marginTop: 5, fontSize: 12, color: T.inkMuted }}>
                    Vigente hasta: {expiryLabel}
                  </div>
                )}
              </div>

              {preview.existingAccount ? (
                <div>
                  <p
                    style={{
                      margin: '0 0 16px',
                      fontFamily: F.sans,
                      color: T.inkSec,
                      lineHeight: 1.6,
                    }}
                  >
                    Ya existe una cuenta veterinaria con este correo. Inicia sesión para
                    reclamar la invitación y continuar con el onboarding profesional.
                  </p>
                  <button
                    type="button"
                    onClick={onLogin}
                    style={{
                      width: '100%',
                      border: 0,
                      borderRadius: 8,
                      padding: '11px 16px',
                      background: T.sage,
                      color: T.inkInv,
                      fontFamily: F.sans,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Iniciar sesión y continuar
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 14,
                    }}
                  >
                    <label style={labelStyle}>
                      Nombre
                      <input
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        required
                        minLength={2}
                        maxLength={50}
                        autoComplete="given-name"
                        style={inputStyle}
                      />
                    </label>
                    <label style={labelStyle}>
                      Apellido
                      <input
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        required
                        minLength={2}
                        maxLength={50}
                        autoComplete="family-name"
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <label style={{ ...labelStyle, display: 'block', marginTop: 16 }}>
                    Correo de invitación
                    <input
                      value={preview.email}
                      readOnly
                      autoComplete="email"
                      style={{ ...inputStyle, opacity: 0.75 }}
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

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 14,
                      marginTop: 16,
                    }}
                  >
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

                  <div
                    style={{
                      marginTop: 9,
                      fontFamily: F.sans,
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: T.inkMuted,
                    }}
                  >
                    La cuenta se creará como VET. La invitación no sustituye la
                    verificación profesional ni habilita atención pública.
                  </div>

                  {(localError || error) && (
                    <div
                      role="alert"
                      style={{
                        marginTop: 16,
                        padding: 12,
                        borderRadius: 8,
                        border: '1px solid #FECACA',
                        background: '#FEF2F2',
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
                    {isLoading ? 'Creando cuenta…' : 'Crear cuenta VET y continuar'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
