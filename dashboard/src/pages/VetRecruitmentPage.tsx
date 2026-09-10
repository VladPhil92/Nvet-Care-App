import { FormEvent, useEffect, useMemo, useState } from 'react'
import { F, T } from '../theme/tokens'
import { getErrorMessage } from '../services/api'
import {
  VetRecruitmentLead,
  VetRecruitmentSnapshot,
  VetRecruitmentStage,
  vetRecruitmentService,
} from '../services/vet-recruitment.service'

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

export default function VetRecruitmentPage() {
  const [snapshot, setSnapshot] = useState<VetRecruitmentSnapshot | null>(null)
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
      setSnapshot(await vetRecruitmentService.getSnapshot(marketFilter || undefined))
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
            <p style={{ margin: '7px 0 0', color: T.inkMuted, maxWidth: 760, lineHeight: 1.6 }}>
              CRM de reclutamiento y conversión. Un prospecto nunca cuenta como cobertura hasta que su cuenta VET real alcanza el estado operacional.
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            ['Leads', snapshot?.totals.leads ?? 0],
            ['Activos', snapshot?.totals.activeLeads ?? 0],
            ['Cuentas registradas', snapshot?.totals.registeredAccounts ?? 0],
            ['VET operativos CRM', snapshot?.totals.operationalReadyFromCrm ?? 0],
            ['Seguimientos vencidos', snapshot?.totals.dueFollowUps ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} style={cardStyle}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: T.inkMuted }}>{label}</div>
              <div style={{ marginTop: 6, fontSize: 27, fontWeight: 700, color: T.ink }}>{value}</div>
            </div>
          ))}
        </div>

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

          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1180 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.inkMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.7px' }}>
                {['Candidato', 'Ciudad', 'Outreach', 'Conversión real', 'Seguimiento', 'Siguiente acción', 'Acciones'].map((heading) => (
                  <th key={heading} style={{ padding: '10px 8px', borderBottom: `1px solid ${T.line}` }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(snapshot?.leads ?? []).map((lead) => (
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
              ))}
              {!loading && (snapshot?.leads.length ?? 0) === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: T.inkMuted }}>No hay candidatos registrados para este filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: T.inkMuted, lineHeight: 1.6 }}>
          {snapshot?.privacyBoundary ?? 'Los datos de captación son visibles únicamente para operadores autorizados.'}
        </div>
      </div>
    </main>
  )
}
