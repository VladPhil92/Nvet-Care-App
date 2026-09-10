import { useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '../services/api'
import {
  VetInvitationAdminSummary,
  vetInvitationService,
} from '../services/vet-invitation.service'
import {
  VetOutreachConsentSource,
  VetOutreachConsentSummary,
  vetOutreachConsentService,
} from '../services/vet-outreach-consent.service'
import {
  VetRecruitmentSnapshot,
  vetRecruitmentService,
} from '../services/vet-recruitment.service'
import { F, T } from '../theme/tokens'

const CONSENT_SOURCES: Array<{ value: VetOutreachConsentSource; label: string }> = [
  { value: 'DIRECT_OPT_IN', label: 'Autorización directa' },
  { value: 'PARTNER_REFERRAL_WITH_PERMISSION', label: 'Referido de aliado con permiso' },
  { value: 'EVENT_OR_CAMPAIGN_OPT_IN', label: 'Registro en evento/campaña' },
  { value: 'EXISTING_PROFESSIONAL_RELATIONSHIP', label: 'Relación profesional existente' },
  { value: 'OTHER_DOCUMENTED_PERMISSION', label: 'Otra autorización documentada' },
]

export default function VetInvitationOpsPage() {
  const [recruitment, setRecruitment] = useState<VetRecruitmentSnapshot | null>(null)
  const [invitations, setInvitations] = useState<VetInvitationAdminSummary | null>(null)
  const [consents, setConsents] = useState<VetOutreachConsentSummary | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [consentLeadId, setConsentLeadId] = useState('')
  const [consentSource, setConsentSource] = useState<VetOutreachConsentSource>('DIRECT_OPT_IN')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [statementVersion, setStatementVersion] = useState('vet-recruitment-v1')
  const [consentNote, setConsentNote] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [recruitmentSnapshot, invitationSummary, consentSummary] = await Promise.all([
        vetRecruitmentService.getSnapshot(),
        vetInvitationService.getAdminSummary(),
        vetOutreachConsentService.getAdminSummary(),
      ])
      setRecruitment(recruitmentSnapshot)
      setInvitations(invitationSummary)
      setConsents(consentSummary)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const latestByLead = useMemo(
    () => new Map((invitations?.latestByLead ?? []).map((item) => [item.leadId, item])),
    [invitations],
  )

  const consentByLead = useMemo(
    () => new Map((consents?.permissions ?? []).map((item) => [item.leadId, item])),
    [consents],
  )

  const recordConsent = async () => {
    if (!consentLeadId) {
      setError('Selecciona un candidato para registrar la autorización de contacto.')
      return
    }
    if (evidenceReference.trim().length < 3) {
      setError('Registra una referencia verificable de la evidencia de autorización.')
      return
    }
    if (!statementVersion.trim()) {
      setError('Indica la versión del texto o aviso de autorización utilizado.')
      return
    }

    setBusyId(`consent:${consentLeadId}`)
    setError(null)
    try {
      await vetOutreachConsentService.grant(consentLeadId, {
        channel: 'EMAIL',
        source: consentSource,
        evidenceReference: evidenceReference.trim(),
        authorizationStatementVersion: statementVersion.trim(),
        note: consentNote.trim() || undefined,
      })
      setEvidenceReference('')
      setConsentNote('')
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const revokeConsent = async (leadId: string) => {
    const confirmed = window.confirm(
      '¿Revocar la autorización de contacto? El historial se conservará y no se podrán enviar nuevas invitaciones mientras permanezca revocada.',
    )
    if (!confirmed) return

    setBusyId(`revoke:${leadId}`)
    setError(null)
    try {
      await vetOutreachConsentService.revoke(
        leadId,
        'Revocación registrada desde la consola administrativa Nvet Care',
      )
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const sendInvitation = async (leadId: string) => {
    setBusyId(leadId)
    setError(null)
    try {
      await vetInvitationService.send(leadId)
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

  const fieldStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    border: `1px solid ${T.line}`,
    borderRadius: 8,
    background: T.surface,
    color: T.ink,
    padding: '9px 10px',
    fontFamily: F.sans,
  }

  return (
    <main style={{ padding: 28, background: T.canvas, minHeight: '100vh', fontFamily: F.sans }}>
      <div style={{ maxWidth: 1450, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: F.serif, color: T.ink, fontSize: 30 }}>
              Invitaciones VET
            </h1>
            <p style={{ margin: '7px 0 0', color: T.inkMuted, lineHeight: 1.6, maxWidth: 850 }}>
              Emite invitaciones trazables desde leads reales, registra autorización documentada de contacto, programa seguimiento automático y atribuye la cuenta VET al proceso de captación sin convertir una invitación en cobertura.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} style={{ border: `1px solid ${T.line}`, background: T.surface, borderRadius: 8, padding: '9px 13px', cursor: 'pointer' }}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: 18, padding: 12, borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: T.err }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            ['Invitaciones', invitations?.totals.invitations ?? 0],
            ['Permisos activos', consents?.totals.active ?? 0],
            ['Activas', invitations?.totals.active ?? 0],
            ['Reclamadas', invitations?.totals.claimed ?? 0],
            ['Expiradas', invitations?.totals.expired ?? 0],
            ['Fallidas', invitations?.totals.failed ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} style={cardStyle}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: T.inkMuted }}>{label}</div>
              <div style={{ marginTop: 6, fontSize: 27, fontWeight: 700, color: T.ink }}>{value}</div>
            </div>
          ))}
        </div>

        <section style={{ ...cardStyle, marginBottom: 20 }} aria-labelledby="contact-permission-title">
          <div style={{ marginBottom: 14 }}>
            <h2 id="contact-permission-title" style={{ margin: 0, fontFamily: F.serif, color: T.ink, fontSize: 21 }}>
              Registrar autorización de contacto
            </h2>
            <p style={{ margin: '6px 0 0', color: T.inkMuted, fontSize: 13, lineHeight: 1.55 }}>
              Registra únicamente autorizaciones que puedan demostrarse posteriormente. La referencia de evidencia debe apuntar al soporte real; no pegues documentos sensibles completos en este campo.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ fontSize: 12, color: T.inkMuted }}>
              Candidato
              <select value={consentLeadId} onChange={(event) => setConsentLeadId(event.target.value)} style={{ ...fieldStyle, marginTop: 5 }}>
                <option value="">Seleccionar lead…</option>
                {(recruitment?.leads ?? [])
                  .filter((lead) => !consentByLead.get(lead.leadId)?.contactAllowed)
                  .map((lead) => (
                    <option key={lead.leadId} value={lead.leadId}>
                      {lead.fullName} — {lead.market?.city ?? lead.marketDaneCode}
                    </option>
                  ))}
              </select>
            </label>

            <label style={{ fontSize: 12, color: T.inkMuted }}>
              Fuente de autorización
              <select value={consentSource} onChange={(event) => setConsentSource(event.target.value as VetOutreachConsentSource)} style={{ ...fieldStyle, marginTop: 5 }}>
                {CONSENT_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: 12, color: T.inkMuted }}>
              Referencia de evidencia
              <input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Ej. CRM-2026-09-001 / formulario / acta" style={{ ...fieldStyle, marginTop: 5 }} />
            </label>

            <label style={{ fontSize: 12, color: T.inkMuted }}>
              Versión de autorización
              <input value={statementVersion} onChange={(event) => setStatementVersion(event.target.value)} placeholder="vet-recruitment-v1" style={{ ...fieldStyle, marginTop: 5 }} />
            </label>
          </div>

          <label style={{ display: 'block', marginTop: 12, fontSize: 12, color: T.inkMuted }}>
            Nota opcional
            <input value={consentNote} onChange={(event) => setConsentNote(event.target.value)} placeholder="Contexto breve, sin copiar datos sensibles innecesarios" style={{ ...fieldStyle, marginTop: 5 }} />
          </label>

          <button
            type="button"
            onClick={() => void recordConsent()}
            disabled={!consentLeadId || busyId === `consent:${consentLeadId}`}
            style={{ marginTop: 12, border: 0, borderRadius: 8, background: T.sage, color: T.inkInv, padding: '9px 13px', fontWeight: 700, cursor: consentLeadId ? 'pointer' : 'not-allowed', opacity: consentLeadId ? 1 : 0.45 }}
          >
            {busyId === `consent:${consentLeadId}` ? 'Registrando…' : 'Registrar autorización'}
          </button>
        </section>

        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1220 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.inkMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.7px' }}>
                {['Candidato', 'Ciudad', 'Outreach', 'Conversión', 'Permiso contacto', 'Invitación', 'Expira', 'Acción'].map((heading) => (
                  <th key={heading} style={{ padding: '10px 8px', borderBottom: `1px solid ${T.line}` }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recruitment?.leads ?? []).map((lead) => {
                const invitation = latestByLead.get(lead.leadId)
                const permission = consentByLead.get(lead.leadId)
                const canInvite = Boolean(
                  permission?.contactAllowed &&
                  lead.stage !== 'LOST' &&
                  lead.conversionStage !== 'OPERATIONAL_READY',
                )
                return (
                  <tr key={lead.leadId} style={{ verticalAlign: 'top' }}>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <strong>{lead.fullName}</strong>
                      <div style={{ fontSize: 12, color: T.inkMuted }}>{lead.email}</div>
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>{lead.market?.city ?? lead.marketDaneCode}</td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>{lead.stage}</td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>{lead.conversionStage}</td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <strong>{permission?.state ?? 'NOT_RECORDED'}</strong>
                      {permission?.source && <div style={{ fontSize: 11, color: T.inkMuted }}>{permission.source}</div>}
                      {permission?.authorizationStatementVersion && <div style={{ fontSize: 11, color: T.inkMuted }}>Versión: {permission.authorizationStatementVersion}</div>}
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <strong>{invitation?.status ?? 'SIN INVITACIÓN'}</strong>
                      {invitation?.mailDriver && <div style={{ fontSize: 11, color: T.inkMuted }}>Driver: {invitation.mailDriver}</div>}
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>
                      {invitation?.expiresAt ? new Date(invitation.expiresAt).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={!canInvite || busyId === lead.leadId}
                          onClick={() => void sendInvitation(lead.leadId)}
                          title={!permission?.contactAllowed ? 'Registra una autorización vigente antes de enviar' : undefined}
                          style={{ border: 0, borderRadius: 7, background: T.sage, color: T.inkInv, padding: '7px 10px', fontWeight: 700, cursor: canInvite ? 'pointer' : 'not-allowed', opacity: canInvite ? 1 : 0.45 }}
                        >
                          {busyId === lead.leadId ? 'Enviando…' : invitation?.status === 'ACTIVE' ? 'Reemitir' : 'Enviar invitación'}
                        </button>
                        {permission?.contactAllowed && (
                          <button
                            type="button"
                            disabled={busyId === `revoke:${lead.leadId}`}
                            onClick={() => void revokeConsent(lead.leadId)}
                            style={{ border: `1px solid ${T.line}`, borderRadius: 7, background: T.surface, color: T.ink, padding: '7px 10px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            {busyId === `revoke:${lead.leadId}` ? 'Revocando…' : 'Revocar permiso'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && (recruitment?.leads.length ?? 0) === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: T.inkMuted }}>No hay leads VET para invitar.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: T.inkMuted, lineHeight: 1.6 }}>
          La autorización de contacto se registra en un ledger append-only y la evidencia se conserva como referencia. Los tokens de invitación se almacenan únicamente como SHA-256. En producción el envío falla cerrado si no existe autorización vigente o si no existe un proveedor de correo real configurado. Una invitación o un lead nunca cuentan como cobertura veterinaria operativa.
        </div>
      </div>
    </main>
  )
}
