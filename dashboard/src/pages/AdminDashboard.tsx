import { T, F, SPACING } from '../theme/tokens'
import { Metric, Bar, cardStyle } from '../components/UI'
import { Badge } from '../components/UI'
import { PayBadge, TierBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'

export default function AdminDashboard() {
  const { isMobile, isTablet, isDesktop } = useResponsive()

  // Padding adaptable
  const containerPadding = isMobile ? `${SPACING.mobile.gutter}px` : isTablet ? `${SPACING.tablet.gutter}px` : `${SPACING.desktop.gutter}px`
  
  // Grid KPIs condicional
  const kpiColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'
  
  // Paneles: 2 columnas en desktop, stack en mobile/tablet
  const panelColumns = isDesktop ? '1fr 1fr' : '1fr'

  return (
    <div style={{ padding: containerPadding }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiColumns, gap: 14, marginBottom: 24 }}>
        <Metric label="CITAS HOY" value="47" sub="↑ 12 % vs. ayer" accent={T.sage} />
        <Metric label="VETERINARIOS ACTIVOS" value="23" sub="3 pendientes" accent={T.sageLt} />
        <Metric label="VOLUMEN CTG HOY" value="4,821" sub="≈ $2.02 M COP" accent={T.gold} />
        <Metric label="COMISIONES HOY" value="$420 K" sub="CTG + fiat" accent={T.goldLt} />
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: panelColumns, gap: 16, marginBottom: 20 }}>
        {/* Payment methods */}
        <div style={cardStyle}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}` }}>
            <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>
              Ingresos por método de pago
            </div>
          </div>
          <div style={{ padding: '20px 22px' }}>
            {[
              { label: 'CTG One Token', pct: 48, val: '$9.8 M', color: T.gold, badge: 'gold' as const },
              { label: 'PSE', pct: 32, val: '$6.5 M', color: T.payPSE, badge: 'pse' as const },
              { label: 'Transferencia', pct: 20, val: '$4.1 M', color: T.payTRF, badge: 'trf' as const },
            ].map((r, i) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge variant={r.badge}>{r.label}</Badge>
                    <span style={{ fontFamily: F.mono, fontSize: 12, color: T.inkMuted }}>{r.pct}%</span>
                  </span>
                  <span style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 400, color: T.ink }}>{r.val}</span>
                </div>
                <Bar pct={r.pct} color={r.color} />
              </div>
            ))}
          </div>
        </div>

        {/* Transfer tracking */}
        <div style={cardStyle}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>
              Transferencias — trazabilidad
            </div>
            <Badge variant="warn">En vivo</Badge>
          </div>
          <div style={{ padding: '8px 0' }}>
            {[
              { vet: 'Dra. Ospina', cl: 'Laura G.', amt: 85000, st: 'Confirmada', tier: 'elite' as const },
              { vet: 'Dr. Mora', cl: 'Carlos R.', amt: 65000, st: 'Pendiente', tier: 'pro' as const },
              { vet: 'Dra. Ríos', cl: 'Sofía H.', amt: 75000, st: 'En disputa', tier: 'free' as const },
              { vet: 'Dr. Castro', cl: 'Miguel T.', amt: 45000, st: 'Confirmada', tier: 'pro' as const },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 22px', borderBottom: i < 3 ? `1px solid ${T.line}` : 'none' }}>
                <TierBadge t={r.tier} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{r.vet}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>{r.cl}</div>
                </div>
                <span style={{ fontFamily: F.mono, fontSize: 13, color: T.sage }}>${r.amt.toLocaleString('es-CO')}</span>
                <Badge variant={r.st === 'Confirmada' ? 'ok' : r.st === 'Pendiente' ? 'warn' : 'err'}>{r.st}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent appointments */}
      <div style={cardStyle}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>Citas recientes</div>
        </div>
        
        {isMobile ? (
          // Vista Mobile: Cards apiladas
          <div style={{ padding: '8px 0' }}>
            {[
              { id: '#C0047', pac: 'Laura G.', vet: 'Dra. Ospina', tier: 'elite' as const, svc: 'Consulta', pay: 'CTG', comm: '$2.550', st: 'Completada' },
              { id: '#C0048', pac: 'Carlos R.', vet: 'Dr. Mora', tier: 'pro' as const, svc: 'Vacunación', pay: 'TRANSFER', comm: '$5.200', st: 'Verificando' },
              { id: '#C0049', pac: 'Sofía H.', vet: 'Dra. Ríos', tier: 'free' as const, svc: 'Revisión', pay: 'PSE', comm: '$7.500', st: 'Confirmada' },
              { id: '#C0050', pac: 'Miguel T.', vet: 'Dr. Castro', tier: 'pro' as const, svc: 'Consulta', pay: 'CTG', comm: '$6.800', st: 'En camino' },
            ].map((r, i) => (
              <div key={i} style={{ 
                padding: '16px 20px', 
                borderBottom: i < 3 ? `1px solid ${T.line}` : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: F.mono, fontSize: 13, color: T.inkMuted }}>{r.id}</span>
                  <Badge variant={r.st === 'Completada' ? 'ok' : r.st === 'Verificando' ? 'warn' : r.st === 'En camino' ? 'sage' : 'default'}>
                    {r.st}
                  </Badge>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 4 }}>{r.pac}</div>
                    <div style={{ fontSize: 12, color: T.inkSec }}>{r.vet}</div>
                  </div>
                  <TierBadge t={r.tier} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ background: T.surfaceAlt, padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>{r.svc}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <PayBadge m={r.pay} />
                    <span style={{ fontFamily: F.mono, fontSize: 12, color: T.err }}>{r.comm}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Vista Desktop/Tablet: Tabla normal (ocultar columnas en tablet)
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.surfaceAlt }}>
                  {(isTablet ? ['Paciente', 'Veterinario', 'Tier', 'Servicio', 'Estado'] : ['ID', 'Paciente', 'Veterinario', 'Tier', 'Servicio', 'Método', 'Comisión', 'Estado']).map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { id: '#C0047', pac: 'Laura G.', vet: 'Dra. Ospina', tier: 'elite' as const, svc: 'Consulta', pay: 'CTG', comm: '$2.550', st: 'Completada' },
                  { id: '#C0048', pac: 'Carlos R.', vet: 'Dr. Mora', tier: 'pro' as const, svc: 'Vacunación', pay: 'TRANSFER', comm: '$5.200', st: 'Verificando' },
                  { id: '#C0049', pac: 'Sofía H.', vet: 'Dra. Ríos', tier: 'free' as const, svc: 'Revisión', pay: 'PSE', comm: '$7.500', st: 'Confirmada' },
                  { id: '#C0050', pac: 'Miguel T.', vet: 'Dr. Castro', tier: 'pro' as const, svc: 'Consulta', pay: 'CTG', comm: '$6.800', st: 'En camino' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.line}` }}>
                    {!isTablet && <td style={{ padding: '12px 16px' }}><span style={{ fontFamily: F.mono }}>{r.id}</span></td>}
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{r.pac}</td>
                    <td style={{ padding: '12px 16px', color: T.inkSec }}>{r.vet}</td>
                    <td style={{ padding: '12px 16px' }}><TierBadge t={r.tier} /></td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: T.surfaceAlt, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>{r.svc}</span>
                    </td>
                    {!isTablet && <td style={{ padding: '12px 16px' }}><PayBadge m={r.pay} /></td>}
                    {!isTablet && <td style={{ padding: '12px 16px', fontFamily: F.mono, color: T.err }}>{r.comm}</td>}
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={r.st === 'Completada' ? 'ok' : r.st === 'Verificando' ? 'warn' : r.st === 'En camino' ? 'sage' : 'default'}>
                        {r.st}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
