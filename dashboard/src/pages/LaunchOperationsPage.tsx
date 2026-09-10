import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../services/api'
import {
  ExpiryState,
  LaunchOperationsSnapshot,
  ObservationState,
  launchOperationsService,
} from '../services/launch-operations.service'
import { F, T } from '../theme/tokens'

const ACTION_LABEL: Record<string, string> = {
  KEEP_BOOKING_PAUSED_AND_REMEDIATE: 'Mantener reservas pausadas y corregir el incidente',
  CLEAR_PHASE24_BLOCKERS: 'Resolver primero los blockers de Launch Readiness',
  RENEW_OR_REPLACE_EXPIRING_CONTROLS: 'Renovar los controles que están próximos a vencer',
  ENABLE_BETA_ONLY_THROUGH_OPERATOR_PROVIDER_ACTION:
    'La beta puede habilitarse únicamente mediante acción deliberada del operador',
  START_OR_RECONCILE_OBSERVATION_WINDOW:
    'Registrar o reconciliar la ventana de observación de la beta activa',
  REVIEW_AND_CLOSE_OBSERVATION_WINDOW:
    'Revisar la evidencia operacional y cerrar la ventana de observación',
  CONTINUE_CONTROLLED_OBSERVATION: 'Continuar la observación controlada de Cartagena',
  CONTINUE_CONTROLLED_CARTAGENA_BETA: 'Continuar la beta controlada de Cartagena',
}

const OBSERVATION_LABEL: Record<ObservationState, string> = {
  MISSING: 'Sin iniciar',
  ACTIVE: 'En observación',
  ELIGIBLE_TO_CLOSE: 'Lista para revisión',
  CLOSED: 'Ventana cerrada',
  ABORTED: 'Abortada',
  CONFLICTED: 'Conflicto de ledger',
}

function stateColor(state: string) {
  if (state === 'GO' || state === 'HEALTHY' || state === 'NON_EXPIRING' || state === 'CLOSED') {
    return T.ok
  }
  if (
    state === 'PAUSE' ||
    state === 'ATTENTION' ||
    state === 'WARNING' ||
    state === 'ACTIVE' ||
    state === 'ELIGIBLE_TO_CLOSE'
  ) {
    return T.warn
  }
  return T.err
}

function expiryLabel(state: ExpiryState) {
  const labels: Record<ExpiryState, string> = {
    NON_EXPIRING: 'Sin vencimiento',
    HEALTHY: 'Saludable',
    ATTENTION: 'Atención ≤72h',
    WARNING: 'Alerta ≤24h',
    CRITICAL: 'Crítico ≤6h',
    EXPIRED: 'Vencido',
  }
  return labels[state]
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value))
}

function formatHours(value: number | null) {
  if (value === null) return '—'
  if (value < 0) return `${Math.abs(value).toFixed(1)} h vencidas`
  if (value < 24) return `${value.toFixed(value < 10 ? 1 : 0)} h`
  return `${(value / 24).toFixed(1)} d`
}

export default function LaunchOperationsPage() {
  const [snapshot, setSnapshot] = useState<LaunchOperationsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [incidentReference, setIncidentReference] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await launchOperationsService.getSnapshot())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: 'start' | 'close' | 'abort') => {
    if (reason.trim().length < 3) {
      setError('Registra una razón operacional de al menos 3 caracteres.')
      return
    }
    if (action === 'abort' && incidentReference.trim().length === 0) {
      setError('El aborto requiere una referencia de incidente.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next =
        action === 'start'
          ? await launchOperationsService.startObservation(reason.trim())
          : action === 'close'
            ? await launchOperationsService.closeObservation(reason.trim())
            : await launchOperationsService.abortObservation(
                reason.trim(),
                incidentReference.trim(),
              )
      setSnapshot(next)
      setReason('')
      setIncidentReference('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading && !snapshot) {
    return (
      <main style={{ padding: 28, fontFamily: F.sans, color: T.inkMuted }}>
        Cargando control operacional de Cartagena…
      </main>
    )
  }

  if (!snapshot) {
    return (
      <main style={{ padding: 28, fontFamily: F.sans }}>
        <h1 style={{ color: T.ink }}>Operación CTG</h1>
        <div role="alert" style={{ color: T.err }}>{error ?? 'No fue posible cargar el control operacional.'}</div>
      </main>
    )
  }

  const canStart =
    snapshot.decision.phase24 === 'GO' &&
    snapshot.runtime.closedBetaEnabled &&
    snapshot.runtime.bookingEnabled &&
    !['ACTIVE', 'ELIGIBLE_TO_CLOSE', 'CONFLICTED'].includes(snapshot.observation.state)
  const canClose = snapshot.observation.state === 'ELIGIBLE_TO_CLOSE'
  const canAbort = ['ACTIVE', 'ELIGIBLE_TO_CLOSE'].includes(snapshot.observation.state)

  return (
    <main
      style={{
        padding: 28,
        minHeight: '100vh',
        background: T.canvas,
        color: T.ink,
        fontFamily: F.sans,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div>
          <div style={{ color: T.inkMuted, fontSize: 12, letterSpacing: '.08em' }}>
            FASE 25 · CARTAGENA
          </div>
          <h1 style={{ margin: '4px 0 6px', fontFamily: F.serif, fontSize: 34, fontWeight: 500 }}>
            Operator Launch Control
          </h1>
          <p style={{ margin: 0, color: T.inkMuted, maxWidth: 790, lineHeight: 1.55 }}>
            Control de continuidad para la beta cerrada: vencimientos, checklist y ventana
            de observación durable. Esta consola registra evidencia operacional, pero no
            activa flags del proveedor ni autoriza un lanzamiento comercial.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: `1px solid ${T.line}`,
            background: T.surface,
            color: T.ink,
            cursor: loading || busy ? 'default' : 'pointer',
            fontWeight: 650,
          }}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: 12,
            marginBottom: 18,
            borderRadius: 8,
            border: `1px solid ${T.err}`,
            background: T.surface,
            color: T.err,
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div style={{ background: T.surface, border: `1px solid ${stateColor(snapshot.decision.effective)}`, borderRadius: 12, padding: 18 }}>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>DECISIÓN EFECTIVA</div>
          <div style={{ fontFamily: F.serif, fontSize: 42, color: stateColor(snapshot.decision.effective) }}>
            {snapshot.decision.effective}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>Base Fase 24: {snapshot.decision.phase24}</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${stateColor(snapshot.observation.state)}`, borderRadius: 12, padding: 18 }}>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>OBSERVACIÓN</div>
          <div style={{ fontSize: 22, fontWeight: 750, marginTop: 6 }}>
            {OBSERVATION_LABEL[snapshot.observation.state]}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 12, marginTop: 4 }}>
            {snapshot.observation.daysElapsed.toFixed(2)} / {snapshot.observation.minimumObservationDays} días
          </div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${stateColor(snapshot.expiryWatch.state)}`, borderRadius: 12, padding: 18 }}>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>EXPIRY WATCH</div>
          <div style={{ fontSize: 22, fontWeight: 750, marginTop: 6, color: stateColor(snapshot.expiryWatch.state) }}>
            {expiryLabel(snapshot.expiryWatch.state)}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 12, marginTop: 4 }}>
            Próximo: {formatDate(snapshot.expiryWatch.earliestExpiryAt)}
          </div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${snapshot.checklist.blockingSatisfied ? T.ok : T.warn}`, borderRadius: 12, padding: 18 }}>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>CHECKLIST</div>
          <div style={{ fontSize: 28, fontWeight: 750, marginTop: 4 }}>
            {snapshot.checklist.completed}/{snapshot.checklist.total}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>
            Blockers: {snapshot.checklist.blockingSatisfied ? 'satisfechos' : 'pendientes'}
          </div>
        </div>
      </section>

      <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontFamily: F.serif, fontWeight: 500 }}>Acción del operador</h2>
        <div style={{ fontSize: 18, marginBottom: 10 }}>
          {ACTION_LABEL[snapshot.decision.operatorAction] ?? snapshot.decision.operatorAction}
        </div>
        {snapshot.decision.blockers.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            {snapshot.decision.blockers.map((blocker) => (
              <div key={blocker} style={{ color: T.err, fontSize: 13 }}>• {blocker}</div>
            ))}
          </div>
        )}
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, .9fr) minmax(360px, 1.1fr)',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <h2 style={{ marginTop: 0, fontFamily: F.serif, fontWeight: 500 }}>Ventana de observación</h2>
          <div style={{ display: 'grid', gap: 7, fontSize: 13 }}>
            <div>Estado: <strong>{OBSERVATION_LABEL[snapshot.observation.state]}</strong></div>
            <div>Inicio: {formatDate(snapshot.observation.startedAt)}</div>
            <div>Elegible para cierre: {formatDate(snapshot.observation.eligibleToCloseAt)}</div>
            <div>Cierre: {formatDate(snapshot.observation.closedAt)}</div>
            <div>Aborto: {formatDate(snapshot.observation.abortedAt)}</div>
            {snapshot.observation.incidentReference && (
              <div>Incidente: {snapshot.observation.incidentReference}</div>
            )}
          </div>
          <div style={{ marginTop: 14, color: T.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
            El cierre prueba que transcurrió la ventana mínima; no afirma por sí solo que el
            runtime haya permanecido ininterrumpido. Esa evidencia debe revisarse por separado.
          </div>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <h2 style={{ marginTop: 0, fontFamily: F.serif, fontWeight: 500 }}>Registrar evento</h2>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, marginBottom: 10 }}>
            Razón operacional
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              style={{ padding: 10, borderRadius: 8, border: `1px solid ${T.line}`, fontFamily: F.sans }}
            />
          </label>
          {canAbort && (
            <label style={{ display: 'grid', gap: 6, fontSize: 12, marginBottom: 10 }}>
              Referencia de incidente
              <input
                value={incidentReference}
                onChange={(event) => setIncidentReference(event.target.value)}
                maxLength={120}
                style={{ padding: 10, borderRadius: 8, border: `1px solid ${T.line}` }}
              />
            </label>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" disabled={!canStart || busy} onClick={() => void run('start')}>Iniciar observación</button>
            <button type="button" disabled={!canClose || busy} onClick={() => void run('close')}>Cerrar ventana</button>
            <button type="button" disabled={!canAbort || busy} onClick={() => void run('abort')}>Abortar por incidente</button>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: F.serif, fontWeight: 500 }}>Controles y vencimientos</h2>
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden' }}>
          {snapshot.expiryWatch.items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 1fr) 120px 150px 120px',
                gap: 12,
                padding: 12,
                borderBottom: `1px solid ${T.line}`,
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <div><strong>{item.label}</strong><div style={{ color: T.inkMuted, fontSize: 11 }}>{item.kind}</div></div>
              <div style={{ color: stateColor(item.state), fontWeight: 700 }}>{expiryLabel(item.state)}</div>
              <div>{formatDate(item.expiresAt)}</div>
              <div>{formatHours(item.hoursRemaining)}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
        <h2 style={{ marginTop: 0, fontFamily: F.serif, fontWeight: 500 }}>Checklist operacional</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {snapshot.checklist.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
              <span>{item.label}{item.blocking ? ' · obligatorio' : ''}</span>
              <strong style={{ color: item.satisfied ? T.ok : item.blocking ? T.err : T.warn }}>
                {item.satisfied ? 'OK' : 'PENDIENTE'}
              </strong>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, color: T.inkMuted, fontSize: 11 }}>
          Actualizado: {formatDate(snapshot.generatedAt)} · commercialLaunchAuthorized=false
        </div>
      </section>
    </main>
  )
}
