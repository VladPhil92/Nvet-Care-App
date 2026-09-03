import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient, getErrorMessage } from '../services/api'
import { F, T } from '../theme/tokens'

const GATES = [
  'rcPromoted',
  'productionBackupConfigured',
  'restoreDrillVerified',
  'productionAlertingVerified',
  'paymentRailVerified',
  'cartagenaVetCoverageVerified',
  'clientCohortConfigured',
  'supportOwnerConfirmed',
  'privacyAndTermsReviewed',
  'rollbackDrillVerified',
] as const

type Gate = (typeof GATES)[number]
type EvidenceStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'CONFLICTED'

type GateSummary = {
  gate: Gate
  status: 'PENDING' | 'VERIFIED' | 'CONFLICTED'
  requiredEnvironment: 'production'
  approvedEvidenceCount: number
  stagingApprovedEvidenceCount: number
  conflictCount: number
  expiredCount: number
}

type PromotionSummary = {
  totalGates: number
  verifiedGates: number
  pendingGates: number
  conflictedGates: number
  requiredEnvironment: 'production'
  eligibleForOperatorActivation: boolean
  commercialLaunchAuthorized: false
  gates: GateSummary[]
}

type EvidenceItem = {
  evidenceId: string
  gate: Gate
  environment: 'production' | 'staging'
  reference: string
  observedAt: string
  expiresAt: string | null
  note: string | null
  status: EvidenceStatus
  conflictReasons: string[]
  submittedAt: string
  lastEventAt: string
  eventCount: number
}

type Readiness = {
  activation: {
    state: string
    machineActivationReady: boolean
    operatorActivationEligible: boolean
    authorizationRequired: boolean
    authorizationActive: boolean
    authorizationState: string
    authorizationExpiresAt: string | null
    commercialLaunchAuthorized: false
  }
}

type ActivationStatus = {
  state: 'MISSING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'CONFLICTED'
  authorizationId: string | null
  authorizedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  conflictReasons: string[]
  appendOnly: boolean
}

type ActivationPrerequisites = {
  eligible: boolean
  blockers: string[]
  evidenceEligible: boolean
  verifiedActiveVets: number
  minimumVerifiedVets: number
  configuredClients: number
  maxInitialClients: number
  supportConfigured: boolean
  marketConfigured: boolean
}

type ActivationSnapshot = {
  status: ActivationStatus
  prerequisites: ActivationPrerequisites
  authorizationRequiredForBooking: true
  commercialLaunchAuthorized: false
}

function toLocalInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function statusColor(status: string) {
  if (status === 'VERIFIED' || status === 'APPROVED' || status === 'ACTIVE') return T.ok
  if (status === 'CONFLICTED') return T.err
  if (status === 'EXPIRED' || status === 'REVOKED' || status === 'REJECTED') return T.warn
  return T.pending
}

export default function BetaEvidencePage() {
  const [summary, setSummary] = useState<PromotionSummary | null>(null)
  const [history, setHistory] = useState<EvidenceItem[]>([])
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [activation, setActivation] = useState<ActivationSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)
  const [error, setError] = useState('')
  const [leaseHours, setLeaseHours] = useState(24)
  const [form, setForm] = useState({
    gate: GATES[0] as Gate,
    environment: 'production' as 'production' | 'staging',
    reference: '',
    observedAt: toLocalInputValue(),
    expiresAt: '',
    note: '',
  })

  const refresh = useCallback(async () => {
    setError('')
    try {
      const [summaryResponse, historyResponse, readinessResponse, activationResponse] =
        await Promise.all([
          apiClient.get<PromotionSummary>('/beta/evidence/summary'),
          apiClient.get<{ evidence: EvidenceItem[] }>('/beta/evidence/history'),
          apiClient.get<Readiness>('/beta/readiness'),
          apiClient.get<ActivationSnapshot>('/beta/activation'),
        ])
      setSummary(summaryResponse.data)
      setHistory(historyResponse.data.evidence)
      setReadiness(readinessResponse.data)
      setActivation(activationResponse.data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const progress = useMemo(() => {
    if (!summary || summary.totalGates === 0) return 0
    return Math.round((summary.verifiedGates / summary.totalGates) * 100)
  }, [summary])

  const submitEvidence = async () => {
    if (!form.reference.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await apiClient.post('/beta/evidence', {
        gate: form.gate,
        environment: form.environment,
        reference: form.reference.trim(),
        observedAt: new Date(form.observedAt).toISOString(),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        note: form.note.trim() || undefined,
      })
      setForm((current) => ({
        ...current,
        reference: '',
        note: '',
        expiresAt: '',
        observedAt: toLocalInputValue(),
      }))
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const decide = async (item: EvidenceItem, action: 'approve' | 'reject' | 'revoke') => {
    const reason =
      action === 'approve'
        ? ''
        : window.prompt(
            action === 'reject' ? 'Motivo del rechazo:' : 'Motivo de revocación:',
          )
    if (action !== 'approve' && reason === null) return

    setError('')
    try {
      await apiClient.post(`/beta/evidence/${item.evidenceId}/${action}`, {
        reason: reason?.trim() || undefined,
      })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const authorizeBeta = async () => {
    setAuthorizing(true)
    setError('')
    try {
      await apiClient.post('/beta/activation/authorize', {
        durationHours: leaseHours,
        reason: 'Controlled Cartagena beta activation authorization.',
      })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setAuthorizing(false)
    }
  }

  const revokeActivation = async () => {
    const reason = window.prompt('Motivo de revocación de la autorización:')
    if (!reason?.trim()) return
    setAuthorizing(true)
    setError('')
    try {
      await apiClient.post('/beta/activation/revoke', { reason: reason.trim() })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setAuthorizing(false)
    }
  }

  const card = {
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: 12,
    padding: 20,
  } as const

  if (loading) {
    return <div style={{ padding: 32, fontFamily: F.sans, color: T.inkMuted }}>Cargando control de evidencia…</div>
  }

  return (
    <main style={{ padding: 28, background: T.canvas, minHeight: '100vh', fontFamily: F.sans }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header>
          <div style={{ color: T.sageText, fontWeight: 800, fontSize: 12, letterSpacing: 1.2 }}>
            PHASE 12 · CARTAGENA CLOSED BETA
          </div>
          <h1 style={{ margin: '6px 0 8px', color: T.ink, fontFamily: F.serif, fontSize: 34 }}>
            Evidence & Activation Control Plane
          </h1>
          <p style={{ margin: 0, color: T.inkMuted, maxWidth: 760, lineHeight: 1.6 }}>
            Evidencia de producción y autorización operacional append-only. Ningún control de esta pantalla autoriza un lanzamiento comercial público.
          </p>
        </header>

        {error && (
          <div role="alert" style={{ ...card, borderColor: T.err, color: T.err }}>
            {error}
          </div>
        )}

        <section style={{ ...card, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ color: T.ink, fontSize: 20 }}>Elegibilidad operacional</strong>
              <div style={{ color: T.inkMuted, marginTop: 4 }}>
                Runtime: {readiness?.activation.state ?? 'unknown'} · Gates de producción verificados: {summary?.verifiedGates ?? 0}/{summary?.totalGates ?? 0}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: summary?.eligibleForOperatorActivation ? T.ok : T.warn, fontWeight: 800 }}>
                {summary?.eligibleForOperatorActivation ? 'ELIGIBLE FOR OPERATOR AUTHORIZATION' : 'PRODUCTION EVIDENCE PENDING'}
              </div>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Commercial launch authorized: NO</div>
            </div>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: T.line, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: T.sage, transition: 'width .2s' }} />
          </div>
          <div style={{ color: T.inkMuted, fontSize: 13 }}>{progress}% de evidencia de producción aprobada y vigente</div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Autorización controlada</h2>
              <div style={{ marginTop: 5, color: T.inkMuted, fontSize: 13 }}>
                Una autorización activa es obligatoria para nuevas reservas cuando la beta está habilitada.
              </div>
            </div>
            <strong style={{ color: statusColor(activation?.status.state ?? 'MISSING') }}>
              {activation?.status.state ?? 'MISSING'}
            </strong>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt }}>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Prerequisitos</div>
              <strong style={{ color: activation?.prerequisites.eligible ? T.ok : T.warn }}>
                {activation?.prerequisites.eligible ? 'SATISFECHOS' : 'BLOQUEADOS'}
              </strong>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt }}>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Veterinarios Cartagena</div>
              <strong style={{ color: T.ink }}>
                {activation?.prerequisites.verifiedActiveVets ?? 0}/{activation?.prerequisites.minimumVerifiedVets ?? 3}
              </strong>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt }}>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Cohorte</div>
              <strong style={{ color: T.ink }}>
                {activation?.prerequisites.configuredClients ?? 0}/{activation?.prerequisites.maxInitialClients ?? 50}
              </strong>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt }}>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Expiración</div>
              <strong style={{ color: T.ink, fontSize: 13 }}>
                {activation?.status.expiresAt
                  ? new Date(activation.status.expiresAt).toLocaleString()
                  : 'Sin autorización vigente'}
              </strong>
            </div>
          </div>

          {(activation?.prerequisites.blockers.length ?? 0) > 0 && (
            <div style={{ color: T.warn, fontSize: 12 }}>
              Blockers: {activation?.prerequisites.blockers.join(', ')}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap' }}>
            {activation?.status.state !== 'ACTIVE' ? (
              <>
                <label style={{ display: 'grid', gap: 5, color: T.inkSec, fontSize: 12 }}>
                  Lease (horas)
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={leaseHours}
                    onChange={(event) => setLeaseHours(Math.min(168, Math.max(1, Number(event.target.value) || 1)))}
                    style={{ width: 110, padding: 9, border: `1px solid ${T.lineHi}`, borderRadius: 8 }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void authorizeBeta()}
                  disabled={authorizing || !activation?.prerequisites.eligible}
                  style={{ border: 0, borderRadius: 8, padding: '10px 16px', background: T.ink, color: T.inkInv, fontWeight: 800, cursor: 'pointer' }}
                >
                  {authorizing ? 'Autorizando…' : 'Autorizar beta controlada'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void revokeActivation()}
                disabled={authorizing}
                style={{ borderRadius: 8, padding: '10px 16px', border: `1px solid ${T.warn}`, color: T.warn, background: T.surface, fontWeight: 800, cursor: 'pointer' }}
              >
                {authorizing ? 'Revocando…' : 'Revocar autorización'}
              </button>
            )}
          </div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Registrar evidencia</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
              Gate
              <select
                value={form.gate}
                onChange={(event) => setForm((current) => ({ ...current, gate: event.target.value as Gate }))}
                style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8, background: T.surface }}
              >
                {GATES.map((gate) => <option key={gate} value={gate}>{gate}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
              Entorno
              <select
                value={form.environment}
                onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value as 'production' | 'staging' }))}
                style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8, background: T.surface }}
              >
                <option value="production">production · cuenta para activación</option>
                <option value="staging">staging · solo informativa</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
              Observada
              <input
                type="datetime-local"
                value={form.observedAt}
                onChange={(event) => setForm((current) => ({ ...current, observedAt: event.target.value }))}
                style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
              Expira (opcional)
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8 }}
              />
            </label>
          </div>
          <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
            Referencia de evidencia
            <input
              value={form.reference}
              onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
              placeholder="Ej. GitHub run 33467741703 + issue #115"
              maxLength={500}
              style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
            Nota (sin secretos ni PII)
            <textarea
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              maxLength={500}
              rows={3}
              style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8, resize: 'vertical' }}
            />
          </label>
          <div>
            <button
              type="button"
              onClick={() => void submitEvidence()}
              disabled={submitting || !form.reference.trim()}
              style={{ border: 0, borderRadius: 8, padding: '10px 16px', background: T.ink, color: T.inkInv, fontWeight: 800, cursor: 'pointer' }}
            >
              {submitting ? 'Registrando…' : 'Registrar evidencia'}
            </button>
          </div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Estado por gate</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {summary?.gates.map((gate) => (
              <div key={gate.gate} style={{ padding: 12, border: `1px solid ${T.line}`, borderRadius: 8, background: T.surfaceAlt }}>
                <div style={{ fontFamily: F.mono, fontSize: 12, color: T.ink }}>{gate.gate}</div>
                <div style={{ marginTop: 6, color: statusColor(gate.status), fontWeight: 800 }}>{gate.status}</div>
                <div style={{ marginTop: 4, color: T.inkMuted, fontSize: 12 }}>
                  production approved {gate.approvedEvidenceCount} · staging approved {gate.stagingApprovedEvidenceCount} · expired {gate.expiredCount} · conflicts {gate.conflictCount}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Historial append-only</h2>
          {history.length === 0 && <div style={{ color: T.inkMuted }}>Aún no hay evidencia registrada en el ledger.</div>}
          {history.map((item) => (
            <article key={item.evidenceId} style={{ padding: 14, border: `1px solid ${T.line}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: T.ink, fontWeight: 800 }}>{item.gate}</div>
                  <div style={{ color: T.inkMuted, fontSize: 12, marginTop: 3 }}>{item.environment} · {item.reference}</div>
                </div>
                <strong style={{ color: statusColor(item.status) }}>{item.status}</strong>
              </div>
              <div style={{ color: T.inkMuted, fontSize: 12, marginTop: 8 }}>
                observed {new Date(item.observedAt).toLocaleString()} · events {item.eventCount}
                {item.expiresAt ? ` · expires ${new Date(item.expiresAt).toLocaleString()}` : ''}
              </div>
              {item.conflictReasons.length > 0 && (
                <div style={{ marginTop: 8, color: T.err, fontSize: 12 }}>{item.conflictReasons.join(', ')}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {item.status === 'PENDING' && (
                  <>
                    <button type="button" onClick={() => void decide(item, 'approve')} style={{ padding: '7px 11px', borderRadius: 7, border: `1px solid ${T.ok}`, color: T.ok, background: T.surface, cursor: 'pointer' }}>Aprobar</button>
                    <button type="button" onClick={() => void decide(item, 'reject')} style={{ padding: '7px 11px', borderRadius: 7, border: `1px solid ${T.warn}`, color: T.warn, background: T.surface, cursor: 'pointer' }}>Rechazar</button>
                  </>
                )}
                {item.status === 'APPROVED' && (
                  <button type="button" onClick={() => void decide(item, 'revoke')} style={{ padding: '7px 11px', borderRadius: 7, border: `1px solid ${T.warn}`, color: T.warn, background: T.surface, cursor: 'pointer' }}>Revocar</button>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
