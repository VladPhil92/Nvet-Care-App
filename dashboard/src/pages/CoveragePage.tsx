import { useCallback, useEffect, useState } from 'react'
import coverageService, {
  CoverageReadinessSnapshot,
} from '../services/coverage.service'
import { getErrorMessage } from '../services/api'
import { F, T } from '../theme/tokens'

export default function CoveragePage() {
  const [snapshot, setSnapshot] = useState<CoverageReadinessSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await coverageService.getReadiness())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
              Phase 14 · Colombia Service Coverage
            </div>
            <h1 style={{ fontFamily: F.serif, margin: '7px 0 8px', fontSize: 34 }}>
              Cobertura nacional
            </h1>
            <p style={{ margin: 0, maxWidth: 760, color: T.inkMuted, lineHeight: 1.6 }}>
              Cartagena continúa como mercado inicial. Las demás ciudades permanecen en
              pre-lanzamiento hasta cerrar cobertura veterinaria y controles operativos.
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

        {snapshot && (
          <>
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: 14,
                marginBottom: 22,
              }}
            >
              <SummaryCard
                label="Mercados activos"
                value={String(snapshot.activeMarketDaneCodes.length)}
                detail="Controlados por configuración del proveedor"
              />
              <SummaryCard
                label="Mínimo por mercado"
                value={String(snapshot.minimumGeoReadyVetsPerMarket)}
                detail="Veterinarios verificados y geo-ready"
              />
              <SummaryCard
                label="Geo-enforcement"
                value={snapshot.bookingGeoEnforcement ? 'ACTIVO' : 'DESACTIVADO'}
                detail="Mercado + radio del veterinario"
              />
              <SummaryCard
                label="Mercados activos listos"
                value={snapshot.allActiveMarketsReady ? 'SÍ' : 'NO'}
                detail="Estado de cobertura técnica actual"
              />
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
                <strong>Mercados preparados para expansión</strong>
                <div style={{ color: T.inkMuted, fontSize: 13, marginTop: 4 }}>
                  Tener una ciudad configurada no autoriza su lanzamiento comercial.
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: 820,
                    fontSize: 14,
                  }}
                >
                  <thead>
                    <tr style={{ background: T.surfaceAlt, textAlign: 'left' }}>
                      {[
                        'Ciudad',
                        'Departamento',
                        'DANE',
                        'Estado',
                        'Vets verificados',
                        'Geo-ready',
                        'Mínimo',
                        'Cobertura',
                      ].map((label) => (
                        <th key={label} style={{ padding: '12px 14px', color: T.inkSec }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.markets.map((market) => (
                      <tr key={market.daneCode} style={{ borderTop: `1px solid ${T.line}` }}>
                        <td style={{ padding: '13px 14px', fontWeight: 750 }}>{market.city}</td>
                        <td style={{ padding: '13px 14px', color: T.inkMuted }}>
                          {market.department}
                        </td>
                        <td style={{ padding: '13px 14px', fontFamily: F.mono }}>
                          {market.daneCode}
                        </td>
                        <td style={{ padding: '13px 14px' }}>
                          <StatusPill active={market.status === 'ACTIVE'}>
                            {market.status}
                          </StatusPill>
                        </td>
                        <td style={{ padding: '13px 14px' }}>{market.verifiedActiveVets}</td>
                        <td style={{ padding: '13px 14px' }}>{market.geoReadyVets}</td>
                        <td style={{ padding: '13px 14px' }}>{market.minimumGeoReadyVets}</td>
                        <td style={{ padding: '13px 14px' }}>
                          <StatusPill active={market.coverageSatisfied}>
                            {market.coverageSatisfied ? 'SUFICIENTE' : 'PENDIENTE'}
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
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
              <strong style={{ color: T.ink }}>Regla de activación</strong>
              <div style={{ marginTop: 6 }}>
                Una nueva ciudad se activa únicamente después de alcanzar cobertura mínima,
                cerrar soporte/legal/pagos y agregar su código DANE a{' '}
                <code style={{ fontFamily: F.mono }}>NVET_ACTIVE_SERVICE_MARKETS</code>. La
                activación no exige un cambio de código de Nvet.
              </div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Snapshot: {new Date(snapshot.generatedAt).toLocaleString('es-CO')}
              </div>
            </section>
          </>
        )}

        {!snapshot && loading && (
          <div style={{ padding: 32, textAlign: 'center', color: T.inkMuted }}>
            Consultando cobertura operativa…
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
