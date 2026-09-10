import { FormEvent, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { coverageService } from '../services/coverage.service'
import { getErrorMessage } from '../services/api'
import { vetService, type VetProfile } from '../services/vet.service'
import { vetQueryKeys } from '../hooks/queries/useVetQueries'
import { F, T } from '../theme/tokens'

const SERVICE_MARKETS = [
  { daneCode: '13001', city: 'Cartagena de Indias', department: 'Bolívar' },
  { daneCode: '11001', city: 'Bogotá D.C.', department: 'Bogotá D.C.' },
  { daneCode: '05001', city: 'Medellín', department: 'Antioquia' },
  { daneCode: '08001', city: 'Barranquilla', department: 'Atlántico' },
  { daneCode: '68001', city: 'Bucaramanga', department: 'Santander' },
  { daneCode: '68276', city: 'Floridablanca', department: 'Santander' },
  { daneCode: '76001', city: 'Cali', department: 'Valle del Cauca' },
  { daneCode: '70001', city: 'Sincelejo', department: 'Sucre' },
  { daneCode: '23001', city: 'Montería', department: 'Córdoba' },
  { daneCode: '47001', city: 'Santa Marta', department: 'Magdalena' },
] as const

interface Props {
  profile: VetProfile
}

export default function VetServiceAreaPage({ profile }: Props) {
  const queryClient = useQueryClient()
  const initialMarket = SERVICE_MARKETS.find((market) => market.city === profile.city)
  const [marketCode, setMarketCode] = useState(initialMarket?.daneCode ?? '13001')
  const [latitude, setLatitude] = useState(profile.latitude != null ? String(profile.latitude) : '')
  const [longitude, setLongitude] = useState(profile.longitude != null ? String(profile.longitude) : '')
  const [radius, setRadius] = useState(String(profile.serviceRadius || 10))
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const market = useMemo(
    () => SERVICE_MARKETS.find((candidate) => candidate.daneCode === marketCode) ?? SERVICE_MARKETS[0],
    [marketCode],
  )

  const useCurrentLocation = () => {
    setError(null)
    setNotice(null)
    if (!navigator.geolocation) {
      setError('Este navegador no ofrece geolocalización. Puedes ingresar las coordenadas manualmente.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6))
        setLongitude(position.coords.longitude.toFixed(6))
        setNotice('Ubicación obtenida. Confirma la ciudad y guarda tu zona de servicio.')
        setLocating(false)
      },
      () => {
        setError('No fue posible obtener tu ubicación. Habilita el permiso del navegador o ingresa las coordenadas manualmente.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const lat = Number(latitude)
    const lng = Number(longitude)
    const serviceRadius = Number(radius)

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError('Registra coordenadas válidas para tu base de atención.')
      return
    }
    if (!Number.isFinite(serviceRadius) || serviceRadius < 1 || serviceRadius > 100) {
      setError('El radio de servicio debe estar entre 1 y 100 km.')
      return
    }

    setSubmitting(true)
    try {
      const point = await coverageService.checkPoint(lat, lng)
      if (!point.supported || !point.market) {
        setError('La ubicación indicada todavía no pertenece a una ciudad preparada por Nvet.')
        return
      }
      if (point.market.daneCode !== market.daneCode) {
        setError(
          `La ubicación corresponde a ${point.market.city}, pero seleccionaste ${market.city}. Corrige la ciudad o la ubicación antes de continuar.`,
        )
        return
      }

      await vetService.updateProfile({
        city: market.city,
        department: market.department,
        latitude: lat,
        longitude: lng,
        serviceRadius,
        timezone: 'America/Bogota',
      })
      await queryClient.invalidateQueries({ queryKey: vetQueryKeys.profile() })
      setNotice(
        point.active
          ? `Zona de servicio validada para ${market.city}.`
          : `Zona de servicio validada para ${market.city}. La ciudad permanece en pre-lanzamiento hasta que Nvet active su operación.`,
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
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
  }

  const labelStyle = {
    display: 'grid',
    gap: 6,
    fontFamily: F.sans,
    fontSize: 11,
    fontWeight: 700,
    color: T.inkMuted,
    letterSpacing: '.07em',
    textTransform: 'uppercase' as const,
  }

  return (
    <main style={{ padding: 24, display: 'grid', placeItems: 'center' }}>
      <section
        style={{
          width: '100%',
          maxWidth: 720,
          background: T.surface,
          border: `1px solid ${T.line}`,
          borderRadius: 14,
          padding: 28,
          boxShadow: '0 2px 12px rgba(13,27,42,.06)',
        }}
      >
        <div style={{ color: T.sageText, fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: '.1em' }}>
          ZONA DE SERVICIO · PASO OBLIGATORIO
        </div>
        <h1 style={{ margin: '8px 0 8px', fontFamily: F.serif, fontSize: 30, color: T.ink }}>
          Define dónde atenderás a domicilio
        </h1>
        <p style={{ margin: '0 0 22px', fontFamily: F.sans, fontSize: 13, lineHeight: 1.65, color: T.inkMuted }}>
          Esta información determina si tu perfil puede contar para la cobertura de una ciudad y si un domicilio está dentro de tu radio de atención. La coordenada exacta se usa para cálculos operativos y no se publica en el catálogo de cobertura.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
          <label style={labelStyle}>
            Ciudad de operación
            <select value={marketCode} onChange={(event) => setMarketCode(event.target.value as typeof marketCode)} style={inputStyle}>
              {SERVICE_MARKETS.map((candidate) => (
                <option key={candidate.daneCode} value={candidate.daneCode}>
                  {candidate.city} · {candidate.department}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>
              Latitud base
              <input value={latitude} onChange={(event) => setLatitude(event.target.value)} inputMode="decimal" placeholder="10.39" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Longitud base
              <input value={longitude} onChange={(event) => setLongitude(event.target.value)} inputMode="decimal" placeholder="-75.48" style={inputStyle} />
            </label>
          </div>

          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating || submitting}
            style={{
              border: `1px solid ${T.lineHi}`,
              background: T.surface,
              color: T.ink,
              borderRadius: 8,
              padding: '10px 14px',
              fontFamily: F.sans,
              fontWeight: 700,
              cursor: locating ? 'wait' : 'pointer',
            }}
          >
            {locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual como base de servicio'}
          </button>

          <label style={labelStyle}>
            Radio máximo de atención (km)
            <input type="number" min={1} max={100} step={1} value={radius} onChange={(event) => setRadius(event.target.value)} style={inputStyle} />
          </label>

          <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt, color: T.inkMuted, fontFamily: F.sans, fontSize: 12, lineHeight: 1.55 }}>
            Mercado seleccionado: <strong style={{ color: T.ink }}>{market.city}</strong> · DANE {market.daneCode}. Puedes registrarte desde una ciudad en pre-lanzamiento; eso no habilita reservas hasta que Nvet abra formalmente ese mercado.
          </div>

          {error && (
            <div role="alert" style={{ padding: 12, borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: T.err, fontFamily: F.sans, fontSize: 13 }}>
              {error}
            </div>
          )}
          {notice && (
            <div role="status" style={{ padding: 12, borderRadius: 8, border: `1px solid ${T.sageLt}`, background: T.sageFade, color: T.sageText, fontFamily: F.sans, fontSize: 13 }}>
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || locating}
            style={{
              border: 0,
              borderRadius: 8,
              padding: '12px 16px',
              background: T.sage,
              color: T.inkInv,
              fontFamily: F.sans,
              fontWeight: 800,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Validando zona…' : 'Validar y guardar zona de servicio'}
          </button>
        </form>
      </section>
    </main>
  )
}
