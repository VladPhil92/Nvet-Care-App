import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../services/api'
import {
  serviceQualityService,
  type OverallSloState,
  type ServiceQualitySnapshot,
  type SloMetricState,
} from '../services/service-quality.service'
import { F, T } from '../theme/tokens'

function statusColor(state: OverallSloState | SloMetricState) {
  if (state === 'HEALTHY' || state === 'PASS') return T.ok
  if (state === 'BREACHED') return T.err
  if (state === 'WATCH') return T.warn
  return T.pending
}

function value(input: number | null, suffix = '') {
  return input == null ? '—' : `${input}${suffix}`
}

function minutes(input: number | null) {
  return input == null ? '—' : `${input} min`
}

export default function ServiceQualityPage() {
  const [snapshot, setSnapshot] = useState<ServiceQualitySnapshot | null>(null)
  const [windowHours, setWindowHours] = useState(168)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const data = await serviceQualityService.getSnapshot(windowHours, '13001')
      setSnapshot(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [windowHours])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  const card = {
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: 12,
    padding: 18,
  } as const

  if (loading && !snapshot) {
    return (
      <div style={{ padding: 32, color: T.inkMuted, fontFamily: F.sans }}>
        Calculando calidad operacional…
      </div>
    )
  }

  return (
    <main
      style={{
        padding: 28,
        background: T.canvas,
        minHeight: '100vh',
        fontFamily: F.sans,
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                color: T.sageText,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: 1.2,
              }}
            >
              PHASE 26 · PRODUCTION SERVICE QUALITY
            </div>
            <h1
              style={{
                margin: '6px 0 8px',
                color: T.ink,
                fontFamily: F.serif,
                fontSize: 34,
              }}
            >
              Calidad Beta Cartagena
            </h1>
            <p style={{ margin: 0, color: T.inkMuted, maxWidth: 800, lineHeight: 1.6 }}>
              Telemetría agregada derivada de eventos persistidos de citas y transacciones. Los SLO
              son objetivos internos de operación: no autorizan lanzamiento comercial ni modifican
              el runtime.
            </p>
          </div>
          <label style={{ display: 'grid', gap: 5, color: T.inkSec, fontSize: 12 }}>
            Ventana
            <select
              value={windowHours}
              onChange={(event) => setWindowHours(Number(event.target.value))}
              style={{
                padding: '9px 12px',
                border: `1px solid ${T.lineHi}`,
                borderRadius: 8,
                background: T.surface,
              }}
            >
              <option value={24}>24 horas</option>
              <option value={168}>7 días</option>
              <option value={720}>30 días</option>
            </select>
          </label>
        </header>

        {error && (
          <div role="alert" style={{ ...card, borderColor: T.err, color: T.err }}>
            {error}
          </div>
        )}

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
          }}
        >
          <div style={card}>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>SLO operacional</div>
            <strong
              style={{
                display: 'block',
                marginTop: 6,
                fontSize: 24,
                color: statusColor(snapshot?.slo.overall ?? 'INSUFFICIENT_DATA'),
              }}
            >
              {snapshot?.slo.overall ?? '—'}
            </strong>
          </div>
          <div style={card}>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>Reservas observadas</div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 28, color: T.ink }}>
              {snapshot?.appointments.total ?? 0}
            </strong>
          </div>
          <div style={card}>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>Cohorte madura</div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 28, color: T.ink }}>
              {snapshot?.appointments.matureOutcomeCount ?? 0}
            </strong>
          </div>
          <div style={card}>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>Finalización madura</div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 28, color: T.ink }}>
              {value(snapshot?.appointments.completionRatePct ?? null, '%')}
            </strong>
          </div>
          <div style={card}>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>Demora inicio p95</div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 28, color: T.ink }}>
              {minutes(snapshot?.latency.serviceStartDelayMinutes.p95Minutes ?? null)}
            </strong>
          </div>
          <div style={card}>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>Fallo de pago resuelto</div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 28, color: T.ink }}>
              {value(snapshot?.payments.failureRatePct ?? null, '%')}
            </strong>
          </div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Objetivos internos SLO</h2>
              <div style={{ marginTop: 4, color: T.inkMuted, fontSize: 12 }}>
                Muestra mínima: {snapshot?.slo.minimumSampleSize ?? 10} observaciones por métrica.
                Una métrica sin muestra suficiente impide declarar HEALTHY.
              </div>
            </div>
            <strong style={{ color: statusColor(snapshot?.slo.overall ?? 'INSUFFICIENT_DATA') }}>
              {snapshot?.operatorAction ?? '—'}
            </strong>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 10,
            }}
          >
            {snapshot?.slo.metrics.map((metric) => (
              <article
                key={metric.id}
                style={{
                  padding: 13,
                  borderRadius: 9,
                  background: T.surfaceAlt,
                  border: `1px solid ${T.line}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: T.ink }}>{metric.label}</strong>
                  <strong style={{ color: statusColor(metric.state), fontSize: 12 }}>
                    {metric.state}
                  </strong>
                </div>
                <div style={{ marginTop: 7, color: T.inkSec }}>
                  {value(metric.value, metric.unit === 'percent' ? '%' : ' min')} · objetivo{' '}
                  {metric.comparator === 'LTE' ? '≤' : '≥'} {metric.target}
                  {metric.unit === 'percent' ? '%' : ' min'}
                </div>
                <div style={{ marginTop: 4, color: T.inkMuted, fontSize: 11 }}>
                  n={metric.sampleSize}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          <div style={{ ...card, display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Ciclo de la cita</h2>
            <div style={{ color: T.inkSec, lineHeight: 1.8, fontSize: 13 }}>
              Confirmación de reserva:{' '}
              <strong>{value(snapshot?.appointments.confirmationRatePct ?? null, '%')}</strong>
              <br />
              Finalización madura:{' '}
              <strong>{value(snapshot?.appointments.completionRatePct ?? null, '%')}</strong>
              <br />
              Cancelación madura:{' '}
              <strong>{value(snapshot?.appointments.cancellationRatePct ?? null, '%')}</strong>
              <br />
              Disputa madura:{' '}
              <strong>{value(snapshot?.appointments.disputeRatePct ?? null, '%')}</strong>
              <br />
              Pendientes de madurar:{' '}
              <strong>{snapshot?.appointments.immatureOutcomeCount ?? 0}</strong>
            </div>
            <div style={{ color: T.inkMuted, fontSize: 12, lineHeight: 1.6 }}>
              Las tasas de outcome excluyen citas futuras hasta que alcance su horario de servicio
              más {snapshot?.appointments.maturityGraceMinutes ?? 180} minutos de gracia.
            </div>
          </div>

          <div style={{ ...card, display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Latencias</h2>
            <div style={{ color: T.inkSec, lineHeight: 1.8, fontSize: 13 }}>
              Confirmación de reserva p95:{' '}
              <strong>{minutes(snapshot?.latency.bookingConfirmationMinutes.p95Minutes ?? null)}</strong>
              <br />
              Demora de inicio p95:{' '}
              <strong>{minutes(snapshot?.latency.serviceStartDelayMinutes.p95Minutes ?? null)}</strong>
              <br />
              Confirmación → inicio p95:{' '}
              <strong>{minutes(snapshot?.latency.confirmedToStartMinutes.p95Minutes ?? null)}</strong>
              <br />
              Duración servicio p95:{' '}
              <strong>{minutes(snapshot?.latency.serviceDurationMinutes.p95Minutes ?? null)}</strong>
            </div>
            <div style={{ color: T.inkMuted, fontSize: 12, lineHeight: 1.6 }}>
              Respuesta VET no medida: no existe todavía un evento durable exclusivo del veterinario.
              `confirmedAt` puede originarse en confirmación financiera y no se usa como respuesta VET.
            </div>
          </div>

          <div style={{ ...card, display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Pagos</h2>
            <div style={{ color: T.inkSec, lineHeight: 1.8, fontSize: 13 }}>
              Transacciones: <strong>{snapshot?.payments.transactions ?? 0}</strong>
              <br />
              Resueltas: <strong>{snapshot?.payments.resolvedTransactions ?? 0}</strong>
              <br />
              Pendientes/verificando: <strong>{snapshot?.payments.unresolvedTransactions ?? 0}</strong>
              <br />
              Cobertura transaccional:{' '}
              <strong>{value(snapshot?.payments.transactionCoverageRatePct ?? null, '%')}</strong>
              <br />
              Fallidas: <strong>{snapshot?.payments.statusCounts.FAILED ?? 0}</strong>
              <br />
              Disputadas: <strong>{snapshot?.payments.statusCounts.DISPUTED ?? 0}</strong>
              <br />
              Verificación p95:{' '}
              <strong>{minutes(snapshot?.payments.verificationLatencyMinutes.p95Minutes ?? null)}</strong>
              <br />
              Liquidación p95:{' '}
              <strong>{minutes(snapshot?.payments.settlementLatencyMinutes.p95Minutes ?? null)}</strong>
            </div>
            <div style={{ color: T.inkMuted, fontSize: 12, lineHeight: 1.6 }}>
              PENDING y VERIFYING no cuentan como éxito ni como fallo hasta resolverse.
            </div>
          </div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Integridad de medición</h2>
            <strong
              style={{
                color: (snapshot?.dataQuality.appointmentsWithIssues ?? 0) > 0 ? T.warn : T.ok,
              }}
            >
              {snapshot?.dataQuality.appointmentsWithIssues ?? 0} citas con inconsistencias
            </strong>
          </div>
          <div style={{ color: T.inkMuted, lineHeight: 1.6, fontSize: 12 }}>
            La telemetría solo usa timestamps realmente persistidos. No reconstruye eventos ausentes.
            Citas con mercado no resoluble en la ventana:{' '}
            {snapshot?.dataQuality.unresolvedMarketAppointmentsInWindow ?? 0}.
          </div>
          <div style={{ fontFamily: F.mono, color: T.inkSec, fontSize: 11, lineHeight: 1.7 }}>
            {snapshot
              ? Object.entries(snapshot.dataQuality.categories)
                  .map(([key, count]) => `${key}=${count}`)
                  .join(' · ')
              : '—'}
          </div>
        </section>

        <section style={{ ...card, background: T.surfaceAlt }}>
          <strong style={{ color: T.ink }}>Frontera de decisión</strong>
          <p style={{ margin: '7px 0 0', color: T.inkMuted, lineHeight: 1.6, fontSize: 12 }}>
            Phase 25: {snapshot?.observationContext?.phase25Decision ?? 'N/A'} · observación{' '}
            {snapshot?.observationContext?.observationState ?? 'N/A'} · commercialLaunchAuthorized=false.
            Un SLO saludable es evidencia operacional; nunca sustituye Play Console, evidencia externa,
            cobertura VET ni autorización de lanzamiento.
          </p>
        </section>
      </div>
    </main>
  )
}
