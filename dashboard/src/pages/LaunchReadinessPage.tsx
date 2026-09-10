import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../services/api'
import {
  LaunchGateCategory,
  LaunchGateStatus,
  LaunchReadinessSnapshot,
  launchReadinessService,
} from '../services/launch-readiness.service'
import { F, T } from '../theme/tokens'

const CATEGORY_LABEL: Record<LaunchGateCategory, string> = {
  RELEASE: 'Release',
  INFRASTRUCTURE: 'Infraestructura',
  FINANCIAL: 'Finanzas',
  SUPPLY: 'Oferta VET',
  OPERATIONS: 'Operación',
  LEGAL: 'Legal y privacidad',
}

const GATE_LABEL: Record<string, string> = {
  rcPromoted: 'RC promovido',
  productionBackupConfigured: 'Backup productivo',
  restoreDrillVerified: 'Restore drill',
  productionAlertingVerified: 'Alertamiento productivo',
  paymentRailVerified: 'Rail de pagos real',
  cartagenaVetCoverageVerified: 'Cobertura VET Cartagena',
  clientCohortConfigured: 'Cohorte cliente',
  supportOwnerConfirmed: 'Soporte operativo',
  privacyAndTermsReviewed: 'Privacidad y términos',
  rollbackDrillVerified: 'Rollback drill',
}

const ACTION_LABEL: Record<string, string> = {
  KEEP_BOOKING_PAUSED_AND_REVIEW_INCIDENT:
    'Mantener reservas pausadas y revisar el incidente',
  CONTINUE_CONTROLLED_CARTAGENA_BETA: 'Continuar beta controlada de Cartagena',
  ENABLE_CARTAGENA_CLOSED_BETA_WHEN_OPERATOR_READY:
    'Habilitar beta cerrada cuando el operador esté listo',
  DISABLE_OR_REMEDIATE_BETA_BEFORE_CONTINUING:
    'Deshabilitar o corregir la beta antes de continuar',
  KEEP_BETA_DISABLED_AND_CLEAR_BLOCKERS:
    'Mantener beta deshabilitada y resolver bloqueos',
}

function decisionColor(state: string) {
  if (state === 'GO') return T.ok
  if (state === 'PAUSE') return T.warn
  return T.err
}

function gateColor(status: LaunchGateStatus) {
  if (status === 'VERIFIED') return T.ok
  if (status === 'CONFLICTED') return T.err
  return T.pending
}

function formatHours(value: number | null) {
  if (value === null) return '—'
  if (value < 24) return `${value.toFixed(value < 10 ? 1 : 0)} h`
  return `${(value / 24).toFixed(1)} d`
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value))
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      style={{
        height: 8,
        borderRadius: 99,
        background: T.line,
        overflow: 'hidden',
        marginTop: 8,
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          borderRadius: 99,
          background: value === 100 ? T.ok : T.sage,
          transition: 'width .2s ease',
        }}
      />
    </div>
  )
}

export default function LaunchReadinessPage() {
  const [snapshot, setSnapshot] = useState<LaunchReadinessSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await launchReadinessService.getCartagenaSnapshot())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !snapshot) {
    return (
      <main style={{ padding: 28, fontFamily: F.sans, color: T.inkMuted }}>
        Consolidando evidencia de lanzamiento de Cartagena…
      </main>
    )
  }

  if (error && !snapshot) {
    return (
      <main style={{ padding: 28, fontFamily: F.sans }}>
        <h1 style={{ marginTop: 0, color: T.ink }}>Lanzamiento CTG</h1>
        <div
          role="alert"
          style={{
            padding: 16,
            borderRadius: 10,
            border: `1px solid ${T.err}`,
            color: T.err,
            background: T.surface,
          }}
        >
          {error}
        </div>
      </main>
    )
  }

  if (!snapshot) return null

  const stateColor = decisionColor(snapshot.decision.state)

  return (
    <main
      style={{
        padding: 28,
        background: T.canvas,
        minHeight: '100vh',
        fontFamily: F.sans,
        color: T.ink,
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
            FASE 24 · CARTAGENA
          </div>
          <h1
            style={{
              margin: '4px 0 6px',
              fontFamily: F.serif,
              fontSize: 34,
              fontWeight: 500,
            }}
          >
            Launch Readiness Cockpit
          </h1>
          <p style={{ margin: 0, color: T.inkMuted, maxWidth: 760, lineHeight: 1.55 }}>
            Decisión fail-closed para la beta cerrada de Cartagena. Consolida release,
            infraestructura, pagos, oferta veterinaria, operación, evidencia y estado
            del runtime sin autorizar por sí sola un lanzamiento comercial.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: `1px solid ${T.line}`,
            background: T.surface,
            color: T.ink,
            cursor: loading ? 'default' : 'pointer',
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
            marginBottom: 18,
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${T.err}`,
            color: T.err,
            background: T.surface,
          }}
        >
          {error}
        </div>
      )}

      <section
        style={{
          border: `1px solid ${stateColor}`,
          background: T.surface,
          borderRadius: 14,
          padding: 22,
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, .45fr) minmax(260px, 1.55fr)',
          gap: 24,
        }}
      >
        <div>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>DECISIÓN OPERATIVA</div>
          <div
            style={{
              color: stateColor,
              fontFamily: F.serif,
              fontSize: 54,
              lineHeight: 1,
              margin: '8px 0 10px',
            }}
          >
            {snapshot.decision.state}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 13 }}>
            {snapshot.market.city} · {snapshot.market.daneCode}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Acción recomendada</div>
          <div style={{ fontSize: 18, lineHeight: 1.45, marginBottom: 14 }}>
            {ACTION_LABEL[snapshot.decision.recommendedAction] ??
              snapshot.decision.recommendedAction}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 13, lineHeight: 1.5 }}>
            Este estado se limita a <strong>beta cerrada Cartagena</strong>. La respuesta
            mantiene <code>commercialLaunchAuthorized=false</code> y no modifica
            configuración del proveedor ni aprueba evidencia automáticamente.
          </div>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>EVIDENCIA</div>
          <div style={{ fontSize: 28, fontWeight: 750, marginTop: 4 }}>
            {snapshot.progress.evidenceCompletionPercentage}%
          </div>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>
            {snapshot.progress.verifiedEvidenceGates}/{snapshot.progress.totalEvidenceGates} gates verificados
          </div>
          <ProgressBar value={snapshot.progress.evidenceCompletionPercentage} />
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>OFERTA VET ESTRICTA</div>
          <div style={{ fontSize: 28, fontWeight: 750, marginTop: 4 }}>
            {snapshot.supply.operationalReadyVets}/{snapshot.supply.minimumRequiredVets}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>
            Gap: {snapshot.supply.coverageGap} veterinario(s)
          </div>
          <ProgressBar value={snapshot.progress.operationalSupplyPercentage} />
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>RUNTIME</div>
          <div style={{ fontSize: 20, fontWeight: 750, marginTop: 6 }}>
            {snapshot.runtime.closedBetaEnabled ? 'Beta activa' : 'Beta deshabilitada'}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 12, marginTop: 4 }}>
            Reservas: {snapshot.runtime.bookingEnabled ? 'habilitadas' : 'pausadas'} · Guard:{' '}
            {snapshot.runtime.marketGuardEnabled ? 'activo' : 'inactivo'}
          </div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ color: T.inkMuted, fontSize: 12 }}>AUTORIZACIÓN</div>
          <div style={{ fontSize: 20, fontWeight: 750, marginTop: 6 }}>
            {snapshot.runtime.authorizationActive ? 'Activa' : 'Inactiva'}
          </div>
          <div style={{ color: T.inkMuted, fontSize: 12, marginTop: 4 }}>
            Expira: {formatDate(snapshot.runtime.authorizationExpiresAt)}
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: F.serif, fontWeight: 500, marginBottom: 12 }}>
          Gates por dominio
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {snapshot.categories.map((category) => (
            <div
              key={category.category}
              style={{
                background: T.surface,
                border: `1px solid ${category.ready ? T.ok : category.conflicted ? T.err : T.line}`,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{CATEGORY_LABEL[category.category]}</strong>
                <span style={{ color: category.ready ? T.ok : T.inkMuted, fontSize: 12 }}>
                  {category.verified}/{category.total}
                </span>
              </div>
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {category.gates.map((gate) => (
                  <div
                    key={gate.gate}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 13,
                    }}
                  >
                    <span>{GATE_LABEL[gate.gate] ?? gate.gate}</span>
                    <span style={{ color: gateColor(gate.status), fontWeight: 700 }}>
                      {gate.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <h2 style={{ fontFamily: F.serif, fontWeight: 500, marginTop: 0 }}>Bloqueos</h2>
          {snapshot.decision.blockers.length === 0 ? (
            <div style={{ color: T.ok }}>No hay blockers obligatorios.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {snapshot.decision.blockers.map((blocker) => (
                <div key={blocker} style={{ color: T.err, fontSize: 13 }}>
                  • {blocker}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <h2 style={{ fontFamily: F.serif, fontWeight: 500, marginTop: 0 }}>Alertas de resiliencia</h2>
          {snapshot.decision.warnings.length === 0 ? (
            <div style={{ color: T.ok }}>Sin alertas de SLA de captación.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {snapshot.decision.warnings.map((warning) => (
                <div key={warning} style={{ color: T.warn, fontSize: 13 }}>
                  • {warning}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, color: T.inkMuted, fontSize: 12, lineHeight: 1.5 }}>
            Estas alertas no reemplazan el gate de oferta VET estricta.
          </div>
        </div>
      </section>

      <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
        <h2 style={{ fontFamily: F.serif, fontWeight: 500, marginTop: 0 }}>
          Pipeline de activación VET
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {[
            ['Leads', snapshot.recruitmentResilience.leads],
            ['Operativos', snapshot.recruitmentResilience.operationalReadyFromRecruitment],
            ['En SLA', snapshot.recruitmentResilience.onTrack],
            ['En riesgo', snapshot.recruitmentResilience.atRisk],
            ['Vencidos', snapshot.recruitmentResilience.breached],
            ['Críticos', snapshot.recruitmentResilience.critical],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ borderLeft: `2px solid ${T.line}`, paddingLeft: 10 }}>
              <div style={{ color: T.inkMuted, fontSize: 11 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 750 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 12 }}>
          Mediana lead → evidencia operativa:{' '}
          {formatHours(snapshot.recruitmentResilience.medianLeadToOperationalEvidenceHours)}
        </div>
        {snapshot.recruitmentResilience.bottlenecks.length > 0 && (
          <div style={{ display: 'grid', gap: 7 }}>
            {snapshot.recruitmentResilience.bottlenecks.map((item) => (
              <div
                key={item.blocker}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  fontSize: 13,
                  borderTop: `1px solid ${T.line}`,
                  paddingTop: 7,
                }}
              >
                <span>{item.blocker}</span>
                <span style={{ color: T.inkMuted }}>
                  {item.count} lead(s) · {item.breachedOrCritical} vencido/crítico · más antiguo{' '}
                  {formatHours(item.oldestHours)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16, color: T.inkMuted, fontSize: 11 }}>
          Actualizado: {formatDate(snapshot.generatedAt)}
        </div>
      </section>
    </main>
  )
}
