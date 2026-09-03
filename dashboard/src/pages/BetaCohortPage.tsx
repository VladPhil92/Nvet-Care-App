import { useCallback, useEffect, useState } from 'react'
import { apiClient, getErrorMessage } from '../services/api'
import { F, T } from '../theme/tokens'

type CohortMember = {
  userId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  emailVerified: boolean
  accountActive: boolean
  eligible: boolean
  invitedAt: string | null
  legalAccepted: boolean
  legalAcceptedAt: string | null
}

type CohortSnapshot = {
  ledger: 'audit_logs'
  appendOnly: true
  activeMemberships: number
  eligibleActiveMembers: number
  ineligibleMembers: number
  maxInitialClients: number
  remainingSlots: number
  withinLimit: boolean
  configured: boolean
  members: CohortMember[]
  revokedMemberships: number
  conflictedMemberships: number
  generatedAt: string
}

export default function BetaCohortPage() {
  const [snapshot, setSnapshot] = useState<CohortSnapshot | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      const response = await apiClient.get<CohortSnapshot>('/beta/cohort')
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

  const invite = async () => {
    if (!email.trim()) return
    setMutating(true)
    setError('')
    try {
      await apiClient.post('/beta/cohort/invite', {
        email: email.trim(),
        reason: 'Cartagena closed beta invitation.',
      })
      setEmail('')
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setMutating(false)
    }
  }

  const revoke = async (member: CohortMember) => {
    const reason = window.prompt(
      `Motivo para retirar a ${member.email ?? member.userId} de la cohorte:`,
    )
    if (!reason?.trim()) return

    setMutating(true)
    setError('')
    try {
      await apiClient.post(`/beta/cohort/${member.userId}/revoke`, {
        reason: reason.trim(),
      })
      await refresh()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setMutating(false)
    }
  }

  const card = {
    background: T.surface,
    border: `1px solid ${T.line}`,
    borderRadius: 12,
    padding: 20,
  } as const

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: F.sans, color: T.inkMuted }}>
        Cargando cohorte beta…
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
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header>
          <div
            style={{
              color: T.sageText,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1.2,
            }}
          >
            PHASE 12F · CARTAGENA CLOSED BETA
          </div>
          <h1
            style={{
              margin: '6px 0 8px',
              color: T.ink,
              fontFamily: F.serif,
              fontSize: 34,
            }}
          >
            Cohorte auditable
          </h1>
          <p style={{ margin: 0, color: T.inkMuted, maxWidth: 780, lineHeight: 1.6 }}>
            Invitaciones y revocaciones append-only. La cohorte canónica vive en el ledger de auditoría; no depende de hashes estáticos en variables de entorno.
          </p>
        </header>

        {error && (
          <div role="alert" style={{ ...card, borderColor: T.err, color: T.err }}>
            {error}
          </div>
        )}

        <section
          style={{
            ...card,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>Miembros activos</div>
            <strong style={{ color: T.ink, fontSize: 24 }}>
              {snapshot?.activeMemberships ?? 0}/{snapshot?.maxInitialClients ?? 50}
            </strong>
          </div>
          <div>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>Elegibles</div>
            <strong style={{ color: T.ok, fontSize: 24 }}>
              {snapshot?.eligibleActiveMembers ?? 0}
            </strong>
          </div>
          <div>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>No elegibles</div>
            <strong style={{ color: snapshot?.ineligibleMembers ? T.err : T.ok, fontSize: 24 }}>
              {snapshot?.ineligibleMembers ?? 0}
            </strong>
          </div>
          <div>
            <div style={{ color: T.inkMuted, fontSize: 12 }}>Cupos restantes</div>
            <strong style={{ color: T.ink, fontSize: 24 }}>
              {snapshot?.remainingSlots ?? 50}
            </strong>
          </div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Invitar cliente existente</h2>
            <p style={{ margin: '5px 0 0', color: T.inkMuted, fontSize: 13 }}>
              Solo cuentas CLIENT activas y con email verificado pueden ingresar. La invitación no acepta automáticamente términos ni privacidad.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="cliente@correo.com"
              disabled={mutating || (snapshot?.remainingSlots ?? 0) <= 0}
              style={{
                flex: '1 1 280px',
                padding: 10,
                border: `1px solid ${T.lineHi}`,
                borderRadius: 8,
                background: T.surface,
              }}
            />
            <button
              type="button"
              onClick={() => void invite()}
              disabled={mutating || !email.trim() || (snapshot?.remainingSlots ?? 0) <= 0}
              style={{
                border: 0,
                borderRadius: 8,
                padding: '10px 16px',
                background: T.ink,
                color: T.inkInv,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {mutating ? 'Procesando…' : 'Invitar a la beta'}
            </button>
          </div>
        </section>

        <section style={{ ...card, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0, color: T.ink, fontSize: 20 }}>Miembros activos</h2>
            <span style={{ color: T.inkMuted, fontSize: 12 }}>
              ledger {snapshot?.ledger ?? 'audit_logs'} · append-only
            </span>
          </div>

          {(snapshot?.members.length ?? 0) === 0 && (
            <div style={{ color: T.inkMuted }}>Aún no hay clientes invitados.</div>
          )}

          {snapshot?.members.map((member) => (
            <article
              key={member.userId}
              style={{
                padding: 14,
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                display: 'grid',
                gap: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong style={{ color: T.ink }}>
                    {[member.firstName, member.lastName].filter(Boolean).join(' ') || 'Cliente'}
                  </strong>
                  <div style={{ color: T.inkMuted, fontSize: 13 }}>{member.email}</div>
                </div>
                <strong style={{ color: member.eligible ? T.ok : T.err }}>
                  {member.eligible ? 'ELEGIBLE' : 'NO ELEGIBLE'}
                </strong>
              </div>

              <div style={{ color: T.inkMuted, fontSize: 12 }}>
                Email verificado: {member.emailVerified ? 'sí' : 'no'} · Cuenta activa:{' '}
                {member.accountActive ? 'sí' : 'no'} · Consentimiento vigente:{' '}
                {member.legalAccepted ? 'sí' : 'pendiente'}
              </div>
              <div style={{ color: T.inkMuted, fontSize: 12 }}>
                Invitado:{' '}
                {member.invitedAt ? new Date(member.invitedAt).toLocaleString() : 'sin fecha'}
                {member.legalAcceptedAt
                  ? ` · Legal ${new Date(member.legalAcceptedAt).toLocaleString()}`
                  : ''}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => void revoke(member)}
                  disabled={mutating}
                  style={{
                    padding: '7px 11px',
                    borderRadius: 7,
                    border: `1px solid ${T.warn}`,
                    color: T.warn,
                    background: T.surface,
                    cursor: 'pointer',
                  }}
                >
                  Revocar membresía
                </button>
              </div>
            </article>
          ))}
        </section>

        <section style={{ ...card, color: T.inkMuted, fontSize: 13, lineHeight: 1.6 }}>
          Revocadas históricas: {snapshot?.revokedMemberships ?? 0} · Streams en conflicto:{' '}
          {snapshot?.conflictedMemberships ?? 0}. Ninguna invitación autoriza un lanzamiento comercial ni reemplaza los gates de backups, restore drill, pagos reales, cobertura veterinaria o revisión legal.
        </section>
      </div>
    </main>
  )
}
