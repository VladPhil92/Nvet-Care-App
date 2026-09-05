import { useCallback, useEffect, useState } from 'react'
import { apiClient, getErrorMessage } from '../services/api'
import { F, T } from '../theme/tokens'

type SupportSnapshot = {
  state: 'MISSING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'CONFLICTED'
  configurationId: string | null
  configuredAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  ownerRole: string | null
  channelReference: string | null
  ownerConfigured: boolean
  channelConfigured: boolean
  monitoringConfirmed: boolean
  conflictReasons: string[]
  criticalIncidentTargetMinutes: number
  ledger: 'audit_logs'
  appendOnly: true
  supportReferenceAdminOnly: true
  commercialLaunchAuthorized: false
}

function stateColor(state: SupportSnapshot['state']) {
  if (state === 'ACTIVE') return T.ok
  if (state === 'CONFLICTED') return T.err
  if (state === 'EXPIRED' || state === 'REVOKED') return T.warn
  return T.pending
}

export default function BetaSupportPage() {
  const [snapshot, setSnapshot] = useState<SupportSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    ownerRole: '',
    channelReference: '',
    durationHours: 168,
    monitoringConfirmed: false,
    reason: '',
  })

  const refresh = useCallback(async () => {
    setError('')
    try {
      const response = await apiClient.get<SupportSnapshot>('/beta/support')
      setSnapshot(response.data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const configure = async () => {
    if (!form.ownerRole.trim() || !form.channelReference.trim() || !form.monitoringConfirmed) return
    setSaving(true)
    setError('')
    try {
      await apiClient.post('/beta/support/configure', {
        ownerRole: form.ownerRole.trim(),
        channelReference: form.channelReference.trim(),
        durationHours: form.durationHours,
        monitoringConfirmed: form.monitoringConfirmed,
        reason: form.reason.trim() || undefined,
      })
      setForm({
        ownerRole: '',
        channelReference: '',
        durationHours: 168,
        monitoringConfirmed: false,
        reason: '',
      })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const revoke = async () => {
    const reason = window.prompt('Motivo de revocación de la cobertura de soporte:')
    if (!reason?.trim()) return
    setSaving(true)
    setError('')
    try {
      await apiClient.post('/beta/support/revoke', { reason: reason.trim() })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const card = {
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: 12,
    padding: 20,
  } as const

  if (loading) {
    return <div style={{ padding: 32, fontFamily: F.sans, color: T.inkMuted }}>Cargando soporte Beta…</div>
  }

  return (
    <main style={{ padding: 28, background: T.canvas, minHeight: '100vh', fontFamily: F.sans }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header>
          <div style={{ color: T.sageText, fontWeight: 800, fontSize: 12, letterSpacing: 1.2 }}>
            PHASE 12G · SUPPORT & INCIDENT READINESS
          </div>
          <h1 style={{ margin: '6px 0 8px', color: T.ink, fontFamily: F.serif, fontSize: 34 }}>
            Soporte operacional de la Beta
          </h1>
          <p style={{ margin: 0, color: T.inkMuted, maxWidth: 760, lineHeight: 1.6 }}>
            Configura una cobertura de soporte temporal, auditable y revocable. Esta pantalla no aprueba por sí sola el gate de evidencia supportOwnerConfirmed ni autoriza un lanzamiento comercial.
          </p>
        </header>

        {error && (
          <div role="alert" style={{ ...card, borderColor: T.err, color: T.err }}>
            {error}
          </div>
        )}

        <section style={{ ...card, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Cobertura vigente</h2>
              <div style={{ marginTop: 5, color: T.inkMuted, fontSize: 13 }}>
                Ledger append-only · objetivo P0/P1: {snapshot?.criticalIncidentTargetMinutes ?? 30} min
              </div>
            </div>
            <strong style={{ color: stateColor(snapshot?.state ?? 'MISSING') }}>
              {snapshot?.state ?? 'MISSING'}
            </strong>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt }}>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Owner role</div>
              <strong style={{ color: T.ink }}>{snapshot?.ownerRole ?? 'No configurado'}</strong>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt }}>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Canal oficial</div>
              <strong style={{ color: T.ink }}>{snapshot?.channelReference ?? 'No configurado'}</strong>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt }}>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Monitoreo confirmado</div>
              <strong style={{ color: snapshot?.monitoringConfirmed ? T.ok : T.warn }}>
                {snapshot?.monitoringConfirmed ? 'SÍ' : 'NO'}
              </strong>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: T.surfaceAlt }}>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>Expiración</div>
              <strong style={{ color: T.ink, fontSize: 13 }}>
                {snapshot?.expiresAt ? new Date(snapshot.expiresAt).toLocaleString() : 'Sin lease vigente'}
              </strong>
            </div>
          </div>

          {(snapshot?.conflictReasons.length ?? 0) > 0 && (
            <div style={{ color: T.err, fontSize: 12 }}>
              Conflictos: {snapshot?.conflictReasons.join(', ')}
            </div>
          )}

          {snapshot?.state === 'ACTIVE' && (
            <div>
              <button
                type="button"
                onClick={() => void revoke()}
                disabled={saving}
                style={{ borderRadius: 8, padding: '10px 16px', border: `1px solid ${T.warn}`, color: T.warn, background: T.surface, fontWeight: 800, cursor: 'pointer' }}
              >
                {saving ? 'Procesando…' : 'Revocar cobertura'}
              </button>
            </div>
          )}
        </section>

        {snapshot?.state !== 'ACTIVE' && (
          <section style={{ ...card, display: 'grid', gap: 14 }}>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Configurar nueva cobertura</h2>
            <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
              Owner role
              <input
                value={form.ownerRole}
                onChange={(event) => setForm((current) => ({ ...current, ownerRole: event.target.value }))}
                placeholder="Ej. Beta Operations Lead"
                maxLength={120}
                style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
              Referencia del canal oficial
              <input
                value={form.channelReference}
                onChange={(event) => setForm((current) => ({ ...current, channelReference: event.target.value }))}
                placeholder="Ej. nvet-beta-incident-channel"
                maxLength={200}
                style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8 }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13, maxWidth: 220 }}>
              Lease (horas)
              <input
                type="number"
                min={1}
                max={168}
                value={form.durationHours}
                onChange={(event) => setForm((current) => ({ ...current, durationHours: Math.min(168, Math.max(1, Number(event.target.value) || 1)) }))}
                style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: T.inkSec, fontSize: 13, lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={form.monitoringConfirmed}
                onChange={(event) => setForm((current) => ({ ...current, monitoringConfirmed: event.target.checked }))}
              />
              Confirmo que la ruta indicada estará monitoreada durante toda la vigencia de esta lease.
            </label>
            <label style={{ display: 'grid', gap: 6, color: T.inkSec, fontSize: 13 }}>
              Nota operacional (opcional, sin secretos)
              <textarea
                value={form.reason}
                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                maxLength={500}
                rows={3}
                style={{ padding: 10, border: `1px solid ${T.lineHi}`, borderRadius: 8, resize: 'vertical' }}
              />
            </label>
            <div>
              <button
                type="button"
                onClick={() => void configure()}
                disabled={saving || !form.ownerRole.trim() || !form.channelReference.trim() || !form.monitoringConfirmed}
                style={{ border: 0, borderRadius: 8, padding: '10px 16px', background: T.ink, color: T.inkInv, fontWeight: 800, cursor: 'pointer' }}
              >
                {saving ? 'Guardando…' : 'Activar cobertura de soporte'}
              </button>
            </div>
          </section>
        )}

        <section style={{ ...card, background: T.surfaceAlt }}>
          <strong style={{ color: T.ink }}>Límite de evidencia</strong>
          <p style={{ margin: '8px 0 0', color: T.inkMuted, lineHeight: 1.6, fontSize: 13 }}>
            Tener una lease ACTIVE satisface únicamente el prerequisito técnico de soporte. El gate supportOwnerConfirmed permanece pendiente hasta registrar y aprobar evidencia real de responsable, canal monitoreado, aprobador y fecha.
          </p>
        </section>
      </div>
    </main>
  )
}
