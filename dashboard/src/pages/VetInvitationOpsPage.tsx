import { useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '../services/api'
import {
  VetInvitationAdminSummary,
  vetInvitationService,
} from '../services/vet-invitation.service'
import {
  VetRecruitmentSnapshot,
  vetRecruitmentService,
} from '../services/vet-recruitment.service'
import { F, T } from '../theme/tokens'

export default function VetInvitationOpsPage() {
  const [recruitment, setRecruitment] = useState<VetRecruitmentSnapshot | null>(null)
  const [invitations, setInvitations] = useState<VetInvitationAdminSummary | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [recruitmentSnapshot, invitationSummary] = await Promise.all([
        vetRecruitmentService.getSnapshot(),
        vetInvitationService.getAdminSummary(),
      ])
      setRecruitment(recruitmentSnapshot)
      setInvitations(invitationSummary)
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

  return (
    <main style={{ padding: 28, background: T.canvas, minHeight: '100vh', fontFamily: F.sans }}>
      <div style={{ maxWidth: 1450, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: F.serif, color: T.ink, fontSize: 30 }}>
              Invitaciones VET
            </h1>
            <p style={{ margin: '7px 0 0', color: T.inkMuted, lineHeight: 1.6, maxWidth: 780 }}>
              Emite invitaciones trazables desde leads reales, programa seguimiento automático y atribuye la cuenta VET al proceso de captación sin convertir una invitación en cobertura.
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

        <div style={{ ...cardStyle, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.inkMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.7px' }}>
                {['Candidato', 'Ciudad', 'Outreach', 'Conversión', 'Invitación', 'Expira', 'Acción'].map((heading) => (
                  <th key={heading} style={{ padding: '10px 8px', borderBottom: `1px solid ${T.line}` }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(recruitment?.leads ?? []).map((lead) => {
                const invitation = latestByLead.get(lead.leadId)
                const canInvite = lead.stage !== 'LOST' && lead.conversionStage !== 'OPERATIONAL_READY'
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
                      <strong>{invitation?.status ?? 'SIN INVITACIÓN'}</strong>
                      {invitation?.mailDriver && <div style={{ fontSize: 11, color: T.inkMuted }}>Driver: {invitation.mailDriver}</div>}
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>
                      {invitation?.expiresAt ? new Date(invitation.expiresAt).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '12px 8px', borderBottom: `1px solid ${T.line}` }}>
                      <button
                        type="button"
                        disabled={!canInvite || busyId === lead.leadId}
                        onClick={() => void sendInvitation(lead.leadId)}
                        style={{ border: 0, borderRadius: 7, background: T.sage, color: T.inkInv, padding: '7px 10px', fontWeight: 700, cursor: canInvite ? 'pointer' : 'not-allowed', opacity: canInvite ? 1 : 0.45 }}
                      >
                        {busyId === lead.leadId ? 'Enviando…' : invitation?.status === 'ACTIVE' ? 'Reemitir' : 'Enviar invitación'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!loading && (recruitment?.leads.length ?? 0) === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: T.inkMuted }}>No hay leads VET para invitar.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: T.inkMuted, lineHeight: 1.6 }}>
          Los tokens se almacenan únicamente como SHA-256. El token viaja en el fragmento de URL y la invitación solo cuenta como activa cuando el proveedor de correo acepta el envío. En producción el envío falla cerrado si no existe un proveedor real configurado.
        </div>
      </div>
    </main>
  )
}
