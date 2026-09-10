import { useCallback, useEffect, useMemo, useState } from 'react'
import coverageService, {
  CartagenaActivationCandidate,
  CartagenaVetActivationSnapshot,
} from '../services/coverage.service'
import vetVerificationAdminService, {
  RegistryCheckStatus,
} from '../services/vet-verification-admin.service'
import { getErrorMessage } from '../services/api'
import { F, T } from '../theme/tokens'

const blockerCopy: Record<string, string> = {
  SERVICE_AREA_MISSING: 'Falta zona de servicio',
  SERVICE_AREA_MISMATCH: 'Ciudad y coordenadas no coinciden',
  DOCUMENTS_MISSING: 'Faltan documentos obligatorios',
  VET_SUBMISSION_REQUIRED: 'El VET debe enviar la solicitud',
  DOCUMENT_REVIEW_REQUIRED: 'Documentos pendientes de revisión',
  DOCUMENT_REJECTED: 'Existe un documento rechazado',
  REGISTRY_CHECK_REQUIRED: 'Falta consulta del registro profesional',
  REGISTRY_NOT_VERIFIED: 'Registro profesional no verificado',
  ACTIVATION_INCONSISTENT: 'Estado de activación inconsistente',
}

export default function VetVerificationOpsPage() {
  const [snapshot, setSnapshot] = useState<CartagenaVetActivationSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionKey, setActionKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await coverageService.getCartagenaActivation())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const ordered = useMemo(() => {
    if (!snapshot) return []
    return [...snapshot.candidates].sort((a, b) => {
      if (a.operationalReady !== b.operationalReady) return a.operationalReady ? 1 : -1
      return a.nextAction.localeCompare(b.nextAction)
    })
  }, [snapshot])

  const run = useCallback(async (key: string, action: () => Promise<void>) => {
    setActionKey(key)
    setError(null)
    try {
      await action()
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionKey(null)
    }
  }, [load])

  const approve = (candidate: CartagenaActivationCandidate, documentId: string) => {
    const notes = window.prompt(
      `Notas de aprobación para ${candidate.displayName} (opcional):`,
      'Documento revisado contra la información presentada.',
    )
    if (notes === null) return
    void run(`approve:${documentId}`, () =>
      vetVerificationAdminService.approveDocument(documentId, notes || undefined),
    )
  }

  const reject = (candidate: CartagenaActivationCandidate, documentId: string) => {
    const reason = window.prompt(
      `Razón de rechazo para ${candidate.displayName} (mínimo 10 caracteres):`,
      '',
    )
    if (!reason) return
    if (reason.trim().length < 10) {
      setError('La razón de rechazo debe tener al menos 10 caracteres.')
      return
    }
    void run(`reject:${documentId}`, () =>
      vetVerificationAdminService.rejectDocument(documentId, reason.trim()),
    )
  }

  const registryCheck = (candidate: CartagenaActivationCandidate, status: RegistryCheckStatus) => {
    const evidence = window.prompt(
      `Evidencia de consulta oficial para ${candidate.displayName} — ${status} (mínimo 10 caracteres):`,
      status === 'VERIFIED'
        ? 'Consulta manual realizada en el registro profesional oficial; identidad y matrícula coinciden.'
        : '',
    )
    if (!evidence) return
    if (evidence.trim().length < 10) {
      setError('La evidencia del registro debe tener al menos 10 caracteres.')
      return
    }
    void run(`registry:${candidate.vetProfileId}`, () =>
      vetVerificationAdminService.recordRegistryCheck(
        candidate.vetProfileId,
        status,
        evidence.trim(),
      ),
    )
  }

  return (
    <main
      style={{
        minHeight: '100%',
        background: T.canvas,
        padding: '28px clamp(16px, 4vw, 40px)',
        fontFamily: F.sans,
        color: T.ink,
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 18,
            flexWrap: 'wrap',
            marginBottom: 22,
          }}
        >
          <div>
            <div style={eyebrowStyle}>Phase 18 · Cartagena Vet Activation</div>
            <h1 style={{ fontFamily: F.serif, margin: '7px 0 8px', fontSize: 34 }}>
              Verificación y activación VET
            </h1>
            <p style={{ margin: 0, maxWidth: 800, color: T.inkMuted, lineHeight: 1.6 }}>
              Circuito operativo para llevar veterinarios reales hasta APPROVED + registro profesional
              verificado + zona de servicio consistente. Alcanzar 3/3 habilita la evidencia de cobertura,
              pero no activa por sí solo la beta ni el lanzamiento comercial.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} style={secondaryButton}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </header>

        {error && <div role="alert" style={errorStyle}>{error}</div>}

        {snapshot && (
          <>
            <section style={summaryGrid}>
              <SummaryCard label="VETs operativos" value={`${snapshot.operationalReady}/${snapshot.minimumOperationalVets}`} detail="APPROVED + activos + geo-ready + registro verificado" />
              <SummaryCard label="Brecha Cartagena" value={String(snapshot.coverageGap)} detail="VETs adicionales requeridos para 3/3" />
              <SummaryCard label="Candidatos" value={String(snapshot.candidateCount)} detail="Perfiles declarados para Cartagena" />
              <SummaryCard
                label="Gate de cobertura"
                value={snapshot.formalEvidence.eligible ? 'ELEGIBLE' : 'BLOQUEADO'}
                detail="cartagena-vet-coverage · runtime-snapshot"
              />
            </section>

            <section style={{ ...panelStyle, marginBottom: 20 }}>
              <strong>Estado de evidencia formal</strong>
              <div style={{ marginTop: 8, color: T.inkMuted, lineHeight: 1.6 }}>
                {snapshot.formalEvidence.reference}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: T.inkMuted }}>
                La evidencia nunca se envía automáticamente. Debe mantenerse el flujo Operator Evidence Control.
              </div>
            </section>

            <section style={{ display: 'grid', gap: 14 }}>
              {ordered.length === 0 && (
                <div style={panelStyle}>
                  <strong>No hay candidatos en Cartagena.</strong>
                  <div style={{ marginTop: 6, color: T.inkMuted }}>
                    El siguiente trabajo es adquisición: registrar veterinarios, completar su zona de servicio y llevarlos al flujo documental.
                  </div>
                </div>
              )}

              {ordered.map((candidate) => (
                <VetCard
                  key={candidate.vetProfileId}
                  candidate={candidate}
                  actionKey={actionKey}
                  onApprove={approve}
                  onReject={reject}
                  onRegistry={registryCheck}
                  onDownload={(documentId, fileName) => {
                    void run(`download:${documentId}`, () =>
                      vetVerificationAdminService.downloadDocument(documentId, fileName),
                    )
                  }}
                />
              ))}
            </section>
          </>
        )}

        {!snapshot && loading && (
          <div style={{ padding: 32, textAlign: 'center', color: T.inkMuted }}>
            Consultando operación de verificación de Cartagena…
          </div>
        )}
      </div>
    </main>
  )
}

function VetCard({
  candidate,
  actionKey,
  onApprove,
  onReject,
  onRegistry,
  onDownload,
}: {
  candidate: CartagenaActivationCandidate
  actionKey: string | null
  onApprove: (candidate: CartagenaActivationCandidate, documentId: string) => void
  onReject: (candidate: CartagenaActivationCandidate, documentId: string) => void
  onRegistry: (candidate: CartagenaActivationCandidate, status: RegistryCheckStatus) => void
  onDownload: (documentId: string, fileName: string) => void
}) {
  const busy = actionKey?.includes(candidate.vetProfileId) ?? false
  return (
    <article style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{candidate.displayName}</div>
          <div style={{ marginTop: 3, color: T.inkMuted, fontSize: 13 }}>
            {candidate.email} · licencia {candidate.licenseNumber} · COMVEZCOL {candidate.comvezcolNumber ?? 'sin registrar'}
          </div>
          <div style={{ marginTop: 4, color: T.inkMuted, fontSize: 13 }}>
            {candidate.city}, {candidate.department} · radio {candidate.serviceRadiusKm} km
          </div>
        </div>
        <StatusPill active={candidate.operationalReady}>
          {candidate.operationalReady ? 'OPERATIVO' : candidate.nextAction}
        </StatusPill>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <MiniStatus label="Zona" ok={candidate.serviceAreaComplete && candidate.geoConsistent} />
        <MiniStatus label={`Docs ${candidate.documents.approved}/${candidate.documents.required}`} ok={candidate.documents.approved === candidate.documents.required} />
        <MiniStatus label={`Estado ${candidate.verificationStatus}`} ok={candidate.verificationStatus === 'APPROVED' && candidate.isDocumentVerified} />
        <MiniStatus label={`Registro ${candidate.registry.status}`} ok={candidate.registry.status === 'VERIFIED'} />
        <MiniStatus label="Activo" ok={candidate.isActive} />
      </div>

      {candidate.blockers.length > 0 && (
        <div style={{ marginTop: 13, color: T.inkMuted, fontSize: 13 }}>
          <strong style={{ color: T.ink }}>Bloqueadores:</strong>{' '}
          {candidate.blockers.map((blocker) => blockerCopy[blocker] ?? blocker).join(' · ')}
        </div>
      )}

      <div style={{ marginTop: 16, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 9 }}>Documentos requeridos</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {candidate.documents.items.map((document) => (
            <div
              key={document.type}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '9px 11px',
                background: T.surfaceAlt,
                borderRadius: 9,
              }}
            >
              <div>
                <strong style={{ fontSize: 13 }}>{document.type}</strong>
                <span style={{ marginLeft: 8, color: T.inkMuted, fontSize: 12 }}>{document.status}</span>
                {document.reviewNotes && (
                  <div style={{ marginTop: 3, color: T.inkMuted, fontSize: 12 }}>{document.reviewNotes}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {document.id && document.fileName && (
                  <button
                    type="button"
                    style={smallButton}
                    disabled={actionKey === `download:${document.id}`}
                    onClick={() => onDownload(document.id as string, document.fileName as string)}
                  >
                    Descargar
                  </button>
                )}
                {document.id && document.status === 'UPLOADED' && (
                  <>
                    <button type="button" style={smallButton} disabled={Boolean(actionKey)} onClick={() => onApprove(candidate, document.id as string)}>
                      Aprobar
                    </button>
                    <button type="button" style={dangerButton} disabled={Boolean(actionKey)} onClick={() => onReject(candidate, document.id as string)}>
                      Rechazar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Registro profesional oficial</div>
        <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 9 }}>
          Estado actual: <strong style={{ color: T.ink }}>{candidate.registry.status}</strong>. La consulta y su evidencia deben ser reales y verificables.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={smallButton} disabled={Boolean(actionKey) || busy} onClick={() => onRegistry(candidate, 'VERIFIED')}>Registrar VERIFIED</button>
          <button type="button" style={smallButton} disabled={Boolean(actionKey) || busy} onClick={() => onRegistry(candidate, 'NOT_FOUND')}>NOT_FOUND</button>
          <button type="button" style={dangerButton} disabled={Boolean(actionKey) || busy} onClick={() => onRegistry(candidate, 'SANCTIONED')}>SANCTIONED</button>
          <button type="button" style={smallButton} disabled={Boolean(actionKey) || busy} onClick={() => onRegistry(candidate, 'UNAVAILABLE')}>UNAVAILABLE</button>
        </div>
      </div>
    </article>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={panelStyle}>
      <div style={{ color: T.inkMuted, fontSize: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 7, fontFamily: F.serif, fontSize: 28 }}>{value}</div>
      <div style={{ marginTop: 5, color: T.inkMuted, fontSize: 12 }}>{detail}</div>
    </div>
  )
}

function MiniStatus({ label, ok }: { label: string; ok: boolean }) {
  return <StatusPill active={ok}>{label}</StatusPill>
}

function StatusPill({ active, children }: { active: boolean; children: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: 999,
        padding: '5px 9px',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '.03em',
        background: active ? T.sageFade : T.goldFade,
        color: active ? T.sageText : T.goldText,
      }}
    >
      {children}
    </span>
  )
}

const eyebrowStyle = {
  color: T.sageText,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '.1em',
  textTransform: 'uppercase' as const,
}

const summaryGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 14,
  marginBottom: 20,
}

const panelStyle = {
  background: T.surface,
  border: `1px solid ${T.line}`,
  borderRadius: 12,
  padding: 18,
}

const secondaryButton = {
  border: `1px solid ${T.lineHi}`,
  background: T.surface,
  color: T.ink,
  borderRadius: 9,
  padding: '10px 15px',
  fontWeight: 700,
  cursor: 'pointer',
}

const smallButton = {
  border: `1px solid ${T.lineHi}`,
  background: T.surface,
  color: T.ink,
  borderRadius: 7,
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const dangerButton = {
  ...smallButton,
  color: T.err,
  border: `1px solid ${T.err}`,
}

const errorStyle = {
  border: `1px solid ${T.err}`,
  background: T.surface,
  color: T.err,
  borderRadius: 10,
  padding: 16,
  marginBottom: 20,
}
