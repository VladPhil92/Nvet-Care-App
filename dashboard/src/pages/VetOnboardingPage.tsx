import { FormEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { T, F } from '../theme/tokens'
import { vetService } from '../services/vet.service'
import { vetQueryKeys } from '../hooks/queries/useVetQueries'
import { getErrorMessage } from '../services/api'

const COMVEZCOL_FORMAT = /^\d{4,6}-\d$/

export default function VetOnboardingPage() {
  const queryClient = useQueryClient()
  const [licenseNumber, setLicenseNumber] = useState('')
  const [specialties, setSpecialties] = useState('')
  const [universityName, setUniversityName] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const normalizedLicense = licenseNumber.trim()
    if (!COMVEZCOL_FORMAT.test(normalizedLicense)) {
      setError('Ingresa el número COMVEZCOL con formato 12345-6.')
      return
    }

    const year = graduationYear.trim() ? Number(graduationYear) : undefined
    if (year !== undefined && (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear())) {
      setError('El año de graduación no es válido.')
      return
    }

    setIsSubmitting(true)
    try {
      await vetService.createProfile({
        licenseNumber: normalizedLicense,
        comvezcolNumber: normalizedLicense,
        specialties: specialties
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        universityName: universityName.trim() || undefined,
        graduationYear: year,
      })
      await queryClient.invalidateQueries({ queryKey: vetQueryKeys.profile() })
      await queryClient.invalidateQueries({ queryKey: vetQueryKeys.verification() })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    border: `1px solid ${T.line}`,
    borderRadius: 8,
    background: T.surfaceAlt,
    color: T.ink,
    padding: '10px 12px',
    fontFamily: F.sans,
    fontSize: 14,
    outline: 'none',
    marginTop: 6,
  }

  const labelStyle = {
    display: 'block',
    fontFamily: F.sans,
    fontSize: 11,
    fontWeight: 700,
    color: T.inkMuted,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
  }

  return (
    <div style={{ padding: 24, display: 'grid', placeItems: 'center' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          background: T.surface,
          border: `1px solid ${T.line}`,
          borderRadius: 12,
          padding: 28,
          boxShadow: '0 2px 12px rgba(13,27,42,.06)',
        }}
      >
        <div style={{ fontFamily: F.serif, fontSize: 28, color: T.ink, marginBottom: 8 }}>
          Completa tu perfil veterinario
        </div>
        <p style={{ margin: '0 0 20px', fontFamily: F.sans, fontSize: 13, lineHeight: 1.65, color: T.inkMuted }}>
          Tu cuenta ya tiene el rol VET y este será tu dashboard permanente. Registra ahora tus datos profesionales para habilitar agenda, tarifas, ingresos, historias clínicas y chat. Tu perfil no será visible para usuarios ni podrá marcarse disponible hasta aprobar la verificación profesional.
        </p>

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>
            Número COMVEZCOL
            <input
              value={licenseNumber}
              onChange={(event) => setLicenseNumber(event.target.value)}
              placeholder="12345-6"
              required
              autoComplete="off"
              style={inputStyle}
            />
          </label>

          <label style={{ ...labelStyle, marginTop: 16 }}>
            Especialidades (separadas por coma)
            <input
              value={specialties}
              onChange={(event) => setSpecialties(event.target.value)}
              placeholder="Medicina general, cirugía, dermatología"
              style={inputStyle}
            />
          </label>

          <label style={{ ...labelStyle, marginTop: 16 }}>
            Universidad (opcional)
            <input
              value={universityName}
              onChange={(event) => setUniversityName(event.target.value)}
              placeholder="Universidad"
              style={inputStyle}
            />
          </label>

          <label style={{ ...labelStyle, marginTop: 16 }}>
            Año de graduación (opcional)
            <input
              type="number"
              value={graduationYear}
              onChange={(event) => setGraduationYear(event.target.value)}
              min={1950}
              max={new Date().getFullYear()}
              placeholder="2020"
              style={inputStyle}
            />
          </label>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #FECACA',
                background: '#FEF2F2',
                color: T.err,
                fontFamily: F.sans,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
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
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.55 : 1,
            }}
          >
            {isSubmitting ? 'Creando perfil…' : 'Habilitar Dashboard Veterinario'}
          </button>
        </form>
      </div>
    </div>
  )
}
