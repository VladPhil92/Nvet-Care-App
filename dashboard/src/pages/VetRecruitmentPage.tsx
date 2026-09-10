import { FormEvent, useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '../services/api'
import {
  VetActivationBlocker,
  VetActivationRisk,
  VetActivationTelemetrySnapshot,
  VetRecruitmentLead,
  VetRecruitmentSnapshot,
  VetRecruitmentStage,
  vetRecruitmentService,
} from '../services/vet-recruitment.service'
import { F, T } from '../theme/tokens'

const FALLBACK_MARKETS = [
  ['13001', 'Cartagena de Indias'],
  ['11001', 'Bogotá D.C.'],
  ['05001', 'Medellín'],
  ['08001', 'Barranquilla'],
  ['68001', 'Bucaramanga'],
  ['68276', 'Floridablanca'],
  ['76001', 'Cali'],
  ['70001', 'Sincelejo'],
  ['23001', 'Montería'],
  ['47001', 'Santa Marta'],
] as const

const STAGE_LABEL: Record<VetRecruitmentStage, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  INTERESTED: 'Interesado',
  INVITED: 'Invitado',
  LOST: 'Perdido',
}

const RISK_LABEL: Record<VetActivationRisk, string> = {
  ON_TRACK: 'En SLA',
  AT_RISK: 'En riesgo',
  BREACHED: 'SLA vencido',
  CRITICAL: 'Crítico',
  COMPLETE: 'Operativo',
  PAUSED: 'Pausado',
}

const BLOCKER_LABEL: Record<VetActivationBlocker, string> = {
  CONTACT_PERMISSION_REQUIRED: 'Autorización de contacto',
  INVITATION_REQUIRED: 'Envío de invitación',
  INVITATION_DELIVERY_PENDING: 'Entrega de invitación',
  INVITATION_DELIVERY_FAILED: 'Fallo de entrega',
  INVITATION_REISSUE_REQUIRED: 'Reemisión de invitación',
  INVITATION_CLAIM_REQUIRED: 'Aceptación de invitación',
  ACCOUNT_LINK_REQUIRED: 'Vinculación de cuenta',
  ACCOUNT_ROLE_MISMATCH: 'Conflicto de rol de cuenta',
  ACCOUNT_EMAIL_UNVERIFIED: 'Verificación de correo',
  ACCOUNT_REGISTERED: 'Creación de perfil VET',
  SERVICE_AREA_REQUIRED: 'Zona de servicio',
  DOCUMENT_REVIEW_REQUIRED: 'Documentación profesional',
  REGISTRY_CHECK_REQUIRED: 'Registro profesional',
  VERIFICATION_APPROVAL_REQUIRED: 'Aprobación administrativa',
  PROFILE_INACTIVE: 'Reactivación del perfil',
  DATA_CONFLICT: 'Conflicto de datos',
  LEAD_LOST: 'Lead perdido',
}

function actionsFor(stage: VetRecruitmentStage): Array<[VetRecruitmentStage, string]> {
  switch (stage) {
    case 'NEW':
      return [
        ['CONTACTED', 'Marcar contactado'],
        ['LOST', 'Descartar'],
      ]
    case 'CONTACTED':
      return [
        ['INTERESTED', 'Interesado'],
        ['INVITED', 'Invitado'],
        ['LOST', 'Descartar'],
      ]
    case 'INTERESTED':
      return [
        ['INVITED', 'Invitado'],
        ['LOST', 'Descartar'],
      ]
    case 'INVITED':
      return [['LOST', 'Descartar']]
    case 'LOST':
      return [['CONTACTED', 'Reabrir']]
  }
}

function formatHours(value: number | null) {
  if (value === null) return '—'
  if (value < 24) return `${value.toFixed(value < 10 ? 1 : 0)} h`
  return `${(value / 24).toFixed(1)} d`
}

export default function VetRecruitmentPage() {
  const [snapshot, setSnapshot] = useState<VetRecruitmentSnapshot | null>(null)
  const [telemetry, setTelemetry] = useState<VetActivationTelemetrySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState('')
  const [followUps, setFollowUps] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    marketDaneCode: '13001',
    source: 'manual',
  })

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [recruitmentSnapshot, activationTelemetry] = await Promise.all([
        vetRecruitmentService.getSnapshot(marketFilter || undefined),
        vetRecruitmentService.getActivationTelemetry(marketFilter || undefined),
      ])
      setSnapshot(recruitmentSnapshot)
      setTelemetry(activationTelemetry)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketFilter])

  const markets = useMemo(() => {
    if (!snapshot?.markets.length) {
      return FALLBACK_MARKETS.map(([daneCode, city]) => ({ daneCode, city }))
    }
    return snapshot.markets.map((market) => ({
      daneCode: market.daneCode,
      city: market.city,
    }))
  }, [snapshot])

  const telemetryByLead = useMemo(
    () => new Map((telemetry?.leads ?? []).map((lead) => [lead.leadId, lead])),
    [telemetry],
  )

  const createLead = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusyId('create')
    try {
      await vetRecruitmentService.createLead({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        marketDaneCode: form.marketDaneCode,
        source: form.source.trim() || undefined,
      })
      setForm((current) => ({ ...current, fullName: '', email: '', phone: '' }))
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const changeStage = async (lead: VetRecruitmentLead, stage: VetRecruitmentStage) => {
    setError(null)
    setBusyId(lead.leadId)
    try {
      await vetRecruitmentService.updateStage(lead.leadId, stage)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const scheduleFollowUp = async (lead: VetRecruitmentLead) => {
    const localValue = followUps[lead.leadId]
    if (!localValue) return
    setError(null)
    setBusyId(lead.leadId)
    try {
      await vetRecruitmentService.scheduleFollowUp(
        lead.leadId,
        new Date(localValue).toISOString(),
      )
      setFollowUps((current) => ({ ...current, [lead.leadId]: '' }))
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const cardStyle = {
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: 12,
    padding: 18,
  }

  const inputStyle = {
    width: '100%',
    padding: '9px 11px',
    borderRadius: 8,
    border: `1px solid ${T.line}`,
    background: T.surface,
    color: T.ink,
    fontFamily: F.sans,
    boxSizing: 'border-box' as const,
  }

  return (
    <main style={{ padding: 28, background: T.canvas, minHeight: '100vh', fontFamily: F.sans }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: F.serif, color: T.ink, fontSize: 30 }}>Captación VET</h1>
            <p style={{ margin: '7px 0 0', color: T.inkMuted, maxWidth: 850, lineHeight: 1.6 }}>
              CRM de reclutamiento, conversión y SLA de activación. Un prospecto nunca cuenta como cobertura hasta que su cuenta VET real alcanza el estado operacional.
            </p>
          </div>
          <select value={marketFilter} onChange={(event) => setMarketFilter(event.target.value)} style={{ ...inputStyle, width: 230, height: 42 }}>
            <option value="">Todas las ciudades</option>
            {FALLBACK_MARKETS.map(([code, city]) => (
              <option key={code} value={code}>{city}</option>
            ))}
          </select>
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: 18, padding: 12, borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: T.err }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            ['Leads', snapshot?.totals.leads ?? 0],
            ['VET operativos', telemetry?.totals.operationalReady ?? 0],
            ['En SLA', telemetry?.totals.onTrack ?? 0],
            ['En riesgo', telemetry?.totals.atRisk ?? 0],
            ['SLA vencido', telemetry?.totals.breached ?? 0],
            ['Críticos', telemetry?.totals.critical ?? 0],
            ['Seguimientos vencidos', snapshot?.totals.dueFollowUps ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} style={cardStyle}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: T.inkMuted }}>{label}</div>
              <div style={{ marginTop: 6, fontSize: 27, fontWeight: 700, color: T.ink }}>{value}</div>
            </div>
          ))}
        </div>

        <section style={{ ...cardStyle, marginBottom: 20 }} aria-labelledby="activation-sla-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <h2 id="activation-sla-title" style={{ margin: 0, fontFamily: F.serif, fontSize: 21, color: T.ink }}>
                SLA de activación VET · Fase 23
              </h2>
              <p style={{ margin: '6px 0 0', color: T.inkMuted, fontSize: 13, lineHeight: 1.55, maxWidth: 820 }}>
                Detecta dónde se detiene cada candidato y prioriza intervención por antigüedad y severidad. Las métricas no sustituyen verificación profesional ni autorizan lanzamiento comercial.
              </p>
            </div>
            <div style={{ fontSize: 12, color: T.inkMuted, textAlign: 'right' }}>
              Mediana lead → evidencia operativa<br />
              <strong style={{ color: T.ink }}>{formatHours(telemetry?.totals.medianLeadToOperationalEvidenceHours ?? null)}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 16 }}>
            {(telemetry?.bottlenecks ?? []).slice(0, 6).map((item) => (
              <div key={item.blocker} style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{BLOCKER_LABEL[item.blocker]}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 12, color: T.inkMuted }}>
                  <span>{item.count} casos</span>
                  <span>{item.breachedOrCritical} vencidos/críticos</span>
                </div>
                <div style={{ marginTop: 5, fontSize: 11, color: T.inkMuted }}>Más antiguo: {formatHours(item.oldestHours)}</div>
              </div>
            ))}
            {!loading && (telemetry?.bottlenecks.length ?? 0) === 0 && (
              <div style={{ color: T.inkMuted, fontSize: 12 }}>No hay cuellos de botella activos en el filtro actual.</div>
            )}
          </div>

          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: T.inkMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.7px' }}>
                  {['Prioridad', 'Candidato', 'Bloqueo', 'Tiempo bloqueado', 'SLA', 'Restante'].map((heading) => (
                    <th key={heading} style={{ padding: '9px 7px', borderBottom: `1px solid ${T.line}` }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(telemetry?.priorityQueue ?? []).slice(0, 8).map((lead) => (
                  <tr key={lead.leadId}>
                    <td style={{ padding: '9px 7px', borderBottom: `1px solid ${T.line}`, fontWeight: 700, color: lead.risk === 'CRITICAL' || lead.risk === 'BREACHED' ? T.err : T.ink }}>
                      {RISK_LABEL[lead.risk]}
                    </td>
                    <td style={{ padding: '9px 7px', borderBottom: `1px solid ${T.line}` }}>
                      <strong>{lead.fullName}</strong>
                      <div style={{ fontSize: 11, color: T.inkMuted }}>{lead.market?.city ?? lead.marketDaneCode}</div>
                    </td>
                    <td style={{ padding: '9px 7px', borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>
                      {lead.currentBlocker ? BLOCKER_LABEL[lead.currentBlocker] : '—'}
                    </td>
                    <td style={{ padding: '9px 7px', borderBottom: `1px solid ${T.line}` }}>{formatHours(lead.blockerAgeHours)}</td>
                    <td style={{ padding: '9px 7px', borderBottom: `1px solid ${T.line}` }}>{formatHours(lead.blockerSlaHours)}</td>
                    <td style={{ padding: '9px 7px', borderBottom: `1px solid ${T.line}`, color: (lead.slaRemainingHours ?? 0) < 0 ? T.err : T.inkMuted }}>
                      {formatHours(lead.slaRemainingHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={createLead} style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: T.ink, marginBottom: 12 }}>Nuevo candidato veterinario</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <input required minLength={2} maxLength={120} placeholder="Nombre completo" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} style={inputStyle} />
            <input required type="email" placeholder="Correo" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={inputStyle} />
            <input type="tel" placeholder="+573001234567" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} style={inputStyle} />
            <select value={form.marketDaneCode} onChange={(event) => setForm({ ...form, marketDaneCode: event.target.value })} style={inputStyle}>
              {markets.map((market) => <option key={market.daneCode} value={market.daneCode}>{market.city}</option>)}
            </select>
            <input maxLength={80} placeholder="Fuente: referido, universidad…" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} style={inputStyle} />
          </div>
          <button disabled={busyId === 'create'} type="submit" style={{ marginTop: 12, border: 0, borderRadius: 8, padding: '10px 16px', background: T.sage, color: T.inkInv, fontWeight: 700, cursor: 'pointer' }}>
            {busyId === 'create' ? 'Guardando…' : 'Crear lead'}
          </button>
        </form>

        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, color: T.ink }}>Embudo de conversión</div>
              <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 3 }}>
                Fuente operacional: {snapshot?.operationalSupplySource ?? 'cargando…'}
              </div>
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} style={{ border: `1px solid ${T.line}`, background: T.surface, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1320 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.inkMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.7px' }}>
                {['Candidato', 'Ciudad', 'Outreach', 'Conversión real', 'SLA activación', 'Seguimiento', 'Siguiente acción', 'Acciones'].map((heading) => (
                  <th key={heading} style={{ padding: '10px 8px', borderBottom: `1px solid ${T.line}` }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(snapshot?.leads ?? []).map((lead) => {
                const activation = telemetryByLead.get(lead.leadId)
                return (
                  <tr key={lead.leadId} style={{ verticalAlign: 'top' }}>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <div style={{ fontWeight: 700, color: T.ink }}>{lead.fullName}</div>
                      <div style={{ fontSize: 12, color: T.inkMuted }}>{lead.email}</div>
                      {lead.phone && <div style={{ fontSize: 12, color: T.inkMuted }}>{lead.phone}</div>}
                      {lead.source && <div style={{ marginTop: 4, fontSize: 11, color: T.inkMuted }}>Fuente: {lead.source}</div>}
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>{lead.market?.city ?? lead.marketDaneCode}</td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <strong>{STAGE_LABEL[lead.stage]}</strong>
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>
                      <strong>{lead.conversionStage}</strong>
                      {lead.linkedUserId && <div style={{ color: T.inkMuted, marginTop: 3 }}>Cuenta enlazada</div>}
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>
                      <strong style={{ color: activation?.risk === 'CRITICAL' || activation?.risk === 'BREACHED' ? T.err : T.ink }}>
                        {activation ? RISK_LABEL[activation.risk] : '—'}
                      </strong>
                      {activation?.currentBlocker && <div style={{ color: T.inkMuted, marginTop: 3 }}>{BLOCKER_LABEL[activation.currentBlocker]}</div>}
                      {activation && !['COMPLETE', 'PAUSED'].includes(activation.risk) && (
                        <div style={{ color: T.inkMuted, marginTop: 3 }}>{formatHours(activation.blockerAgeHours)} / {formatHours(activation.blockerSlaHours)}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <div style={{ fontSize: 12, color: lead.followUpDue ? T.err : T.inkMuted, marginBottom: 6 }}>
                        {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString() : 'Sin programar'}
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input type="datetime-local" value={followUps[lead.leadId] ?? ''} onChange={(event) => setFollowUps((current) => ({ ...current, [lead.leadId]: event.target.value }))} style={{ ...inputStyle, width: 175, padding: '6px 7px', fontSize: 11 }} />
                        <button type="button" disabled={!followUps[lead.leadId] || busyId === lead.leadId} onClick={() => void scheduleFollowUp(lead)} style={{ border: `1px solid ${T.line}`, borderRadius: 7, background: T.surface, cursor: 'pointer' }}>Guardar</button>
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}`, maxWidth: 260, fontSize: 12, color: T.inkSec }}>{lead.nextAction}</td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {actionsFor(lead.stage).map(([stage, label]) => (
                          <button key={stage} type="button" disabled={busyId === lead.leadId} onClick={() => void changeStage(lead, stage)} style={{ border: `1px solid ${T.line}`, borderRadius: 7, background: T.surface, padding: '6px 8px', fontSize: 11, cursor: 'pointer' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && (snapshot?.leads.length ?? 0) === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: T.inkMuted }}>No hay candidatos registrados para este filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: T.inkMuted, lineHeight: 1.6 }}>
          {snapshot?.privacyBoundary ?? 'Los datos de captación son visibles únicamente para operadores autorizados.'}
          {telemetry?.evidenceNotes?.[1] && <><br />{telemetry.evidenceNotes[1]}</>}
        </div>
      </div>
    </main>
  )
}
