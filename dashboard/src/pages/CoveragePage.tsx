import { useCallback, useEffect, useMemo, useState } from 'react'
import coverageService, {
  CoverageReadinessSnapshot,
  MarketLaunchPolicySnapshot,
  VetSupplyFunnelSnapshot,
  VetSupplyStage,
} from '../services/coverage.service'
import { getErrorMessage } from '../services/api'
import { F, T } from '../theme/tokens'

const STAGE_LABEL: Record<VetSupplyStage, string> = {
  ACQUISITION_REQUIRED: 'CAPTACIÓN',
  SERVICE_AREA_REQUIRED: 'ZONA PENDIENTE',
  VERIFICATION_REQUIRED: 'VERIFICACIÓN PENDIENTE',
  VERIFICATION_IN_PROGRESS: 'EN VERIFICACIÓN',
  COVERAGE_GAP: 'BRECHA DE COBERTURA',
  SUPPLY_READY: 'OFERTA LISTA',
}

export default function CoveragePage() {
  const [snapshot, setSnapshot] = useState<CoverageReadinessSnapshot | null>(null)
  const [policy, setPolicy] = useState<MarketLaunchPolicySnapshot | null>(null)
  const [supply, setSupply] = useState<VetSupplyFunnelSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSnapshot, nextPolicy, nextSupply] = await Promise.all([
        coverageService.getReadiness(),
        coverageService.getLaunchPolicy(),
        coverageService.getSupplyFunnel(),
      ])
      setSnapshot(nextSnapshot)
      setPolicy(nextPolicy)
      setSupply(nextSupply)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const policyByDane = useMemo(
    () => new Map(policy?.markets.map((market) => [market.daneCode, market]) ?? []),
    [policy],
  )

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
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 18,
            flexWrap: 'wrap',
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                color: T.sageText,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}
            >
              Phase 17 · Vet Supply & Market Readiness
            </div>
            <h1 style={{ fontFamily: F.serif, margin: '7px 0 8px', fontSize: 34 }}>
              Cobertura, oferta veterinaria y expansión nacional
            </h1>
            <p style={{ margin: 0, maxWidth: 850, color: T.inkMuted, lineHeight: 1.6 }}>
              Cartagena continúa como mercado inicial. Este panel separa la captación de veterinarios,
              la configuración geográfica, la verificación profesional y la oferta realmente operativa.
              Ninguna cifra de este panel autoriza por sí sola un lanzamiento comercial.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            style={{
              border: `1px solid ${T.lineHi}`,
              background: T.surface,
              color: T.ink,
              borderRadius: 9,
              padding: '10px 15px',
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </header>

        {error && (
          <div
            role="alert"
            style={{
              border: `1px solid ${T.err}`,
              background: T.surface,
              color: T.err,
              borderRadius: 10,
              padding: 16,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {snapshot && policy && supply && (
          <>
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                gap: 14,
                marginBottom: 22,
              }}
            >
              <SummaryCard
                label="Perfiles VET en mercados objetivo"
                value={String(supply.totals.totalProfiles)}
                detail="Embudo agregado, sin PII"
              />
              <SummaryCard
                label="VETs operativos geo-ready"
                value={String(supply.totals.operationalGeoReady)}
                detail="Aprobados + activos + zona consistente"
              />
              <SummaryCard
                label="En revisión profesional"
                value={String(supply.totals.pendingReview)}
                detail="PENDING + IN_REVIEW"
              />
              <SummaryCard
                label="Mercados supply-ready"
                value={`${supply.totals.supplyReadyMarkets}/${supply.markets.length}`}
                detail="No equivale a lanzamiento comercial"
              />
              <SummaryCard
                label="Brecha Cartagena"
                value={String(supply.cartagena?.coverageGap ?? supply.minimumOperationalVetsPerMarket)}
                detail="VETs adicionales hasta el mínimo"
              />
              <SummaryCard
                label="Expansión nacional"
                value={policy.nationalExpansionEnabled ? 'ABIERTA' : 'BLOQUEADA'}
                detail="Cartagena no depende de este interruptor"
              />
            </section>

            <section
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 22,
              }}
            >
              <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.line}` }}>
                <strong>Embudo de oferta veterinaria por ciudad</strong>
                <div style={{ color: T.inkMuted, fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>
                  Registrado → zona de servicio completa → geografía consistente → verificación → VET operativo.
                  Solo el último nivel cuenta para la cobertura mínima de mercado.
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: 1180,
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ background: T.surfaceAlt, textAlign: 'left' }}>
                      {[
                        'Ciudad',
                        'Registrados',
                        'Zona completa',
                        'Geo-consistentes',
                        'Pend. revisión',
                        'Aprobados',
                        'Operativos',
                        'Meta',
                        'Brecha',
                        'Progreso',
                        'Etapa',
                      ].map((label) => (
                        <th key={label} style={{ padding: '12px 13px', color: T.inkSec }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {supply.markets.map((market) => {
                      const pendingReview = market.verification.pending + market.verification.inReview
                      const progress = Math.min(
                        100,
                        Math.round((market.operationalGeoReady / market.minimumOperationalVets) * 100),
                      )
                      return (
                        <tr key={market.daneCode} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td style={{ padding: '13px', fontWeight: 750 }}>
                            {market.city}
                            <div style={{ color: T.inkMuted, fontSize: 11, marginTop: 2 }}>
                              {market.department} · DANE {market.daneCode}
                            </div>
                          </td>
                          <td style={{ padding: '13px' }}>{market.totalProfiles}</td>
                          <td style={{ padding: '13px' }}>{market.serviceAreaComplete}</td>
                          <td style={{ padding: '13px' }}>{market.geoConsistent}</td>
                          <td style={{ padding: '13px' }}>{pendingReview}</td>
                          <td style={{ padding: '13px' }}>{market.verification.approved}</td>
                          <td style={{ padding: '13px', fontWeight: 800 }}>{market.operationalGeoReady}</td>
                          <td style={{ padding: '13px' }}>{market.minimumOperationalVets}</td>
                          <td style={{ padding: '13px', fontWeight: 800 }}>{market.coverageGap}</td>
                          <td style={{ padding: '13px', minWidth: 130 }}>
                            <Progress value={progress} />
                            <div style={{ marginTop: 4, color: T.inkMuted, fontSize: 11 }}>{progress}%</div>
                          </td>
                          <td style={{ padding: '13px', maxWidth: 260 }}>
                            <StatusPill active={market.supplyReady}>{STAGE_LABEL[market.stage]}</StatusPill>
                            <div style={{ color: T.inkMuted, fontSize: 11, lineHeight: 1.45, marginTop: 6 }}>
                              {market.recommendedAction}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.line}` }}>
                <strong>Control de activación de mercados</strong>
                <div style={{ color: T.inkMuted, fontSize: 13, marginTop: 4 }}>
                  BOOKING_GATE_ELIGIBLE significa únicamente que superó el gate técnico de oferta y configuración;
                  no autoriza por sí solo un lanzamiento comercial.
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: 1040,
                    fontSize: 14,
                  }}
                >
                  <thead>
                    <tr style={{ background: T.surfaceAlt, textAlign: 'left' }}>
                      {[
                        'Ciudad',
                        'Departamento',
                        'DANE',
                        'Proveedor',
                        'Geo-ready',
                        'Mínimo',
                        'Expansión',
                        'Launch guard',
                      ].map((label) => (
                        <th key={label} style={{ padding: '12px 14px', color: T.inkSec }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.markets.map((market) => {
                      const launch = policyByDane.get(market.daneCode)
                      return (
                        <tr key={market.daneCode} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td style={{ padding: '13px 14px', fontWeight: 750 }}>{market.city}</td>
                          <td style={{ padding: '13px 14px', color: T.inkMuted }}>{market.department}</td>
                          <td style={{ padding: '13px 14px', fontFamily: F.mono }}>{market.daneCode}</td>
                          <td style={{ padding: '13px 14px' }}>
                            <StatusPill active={Boolean(launch?.providerRequested)}>
                              {launch?.providerRequested ? 'SOLICITADO' : 'PRELAUNCH'}
                            </StatusPill>
                          </td>
                          <td style={{ padding: '13px 14px' }}>{launch?.geoReadyVets ?? 0}</td>
                          <td style={{ padding: '13px 14px' }}>{launch?.minimumRequired ?? 3}</td>
                          <td style={{ padding: '13px 14px' }}>
                            <StatusPill active={Boolean(launch?.expansionAllowed)}>
                              {launch?.expansionAllowed ? 'PERMITIDA' : 'BLOQUEADA'}
                            </StatusPill>
                          </td>
                          <td style={{ padding: '13px 14px' }}>
                            <StatusPill active={Boolean(launch?.bookingGateEligible)}>
                              {launch?.state ?? 'PRELAUNCH'}
                            </StatusPill>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              style={{
                marginTop: 20,
                padding: 18,
                borderRadius: 12,
                border: `1px solid ${T.line}`,
                background: T.surface,
                color: T.inkMuted,
                lineHeight: 1.65,
              }}
            >
              <strong style={{ color: T.ink }}>Secuencia operativa</strong>
              <div style={{ marginTop: 6 }}>
                Para Cartagena: captar VETs → configurar zona → completar verificación profesional → alcanzar al menos{' '}
                {supply.minimumOperationalVetsPerMarket} VETs operativos geo-ready → cerrar los gates externos de beta.
              </div>
              <div style={{ marginTop: 8 }}>
                Para una ciudad futura: completar primero el mismo embudo de oferta; luego agregar su DANE a{' '}
                <code style={{ fontFamily: F.mono }}>NVET_ACTIVE_SERVICE_MARKETS</code> y, únicamente con autorización
                operacional, habilitar <code style={{ fontFamily: F.mono }}>NVET_NATIONAL_EXPANSION_ENABLED=true</code>.
              </div>
              <div style={{ marginTop: 8 }}>
                Pagos, soporte, privacidad, evidencia externa y aprobación comercial continúan como controles independientes.
              </div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Supply snapshot: {new Date(supply.generatedAt).toLocaleString('es-CO')}
              </div>
            </section>
          </>
        )}

        {(!snapshot || !policy || !supply) && loading && (
          <div style={{ padding: 32, textAlign: 'center', color: T.inkMuted }}>
            Consultando cobertura, política de lanzamiento y oferta veterinaria…
          </div>
        )}
      </div>
    </main>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ color: T.inkMuted, fontSize: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 7, fontFamily: F.serif, fontSize: 28, color: T.ink }}>{value}</div>
      <div style={{ marginTop: 5, color: T.inkMuted, fontSize: 12 }}>{detail}</div>
    </div>
  )
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
        letterSpacing: '.04em',
        background: active ? T.sageFade : T.goldFade,
        color: active ? T.sageText : T.goldText,
      }}
    >
      {children}
    </span>
  )
}

function Progress({ value }: { value: number }) {
  return (
    <div style={{ height: 7, borderRadius: 999, background: T.surfaceAlt, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%',
          background: T.sage,
          borderRadius: 999,
        }}
      />
    </div>
  )
}
