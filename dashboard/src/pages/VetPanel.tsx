import { useState } from 'react'
import { T, F, SPACING, TIERS } from '../theme/tokens'
import { Metric, Field, Badge, cardStyle, Btn } from '../components/UI'
import { PayBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'

export default function VetPanel() {
  const [showChat, setShowChat] = useState(false)
  const { isMobile, isTablet } = useResponsive()
  
  const tier = TIERS.elite
  const containerPadding = isMobile ? `${SPACING.mobile.gutter}px` : isTablet ? `${SPACING.tablet.gutter}px` : `${SPACING.desktop.gutter}px`
  const kpiColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'
  const mainColumns = isMobile || isTablet ? '1fr' : '1fr 1fr'

  return (
    <div style={{ padding: containerPadding }}>
      {/* Tier header */}
      <div style={{ 
        ...cardStyle, 
        marginBottom: 24, 
        padding: isMobile ? '16px 20px' : '20px 28px', 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center', 
        gap: isMobile ? 12 : 20, 
        borderLeft: `3px solid ${tier.color}` 
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: tier.color, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4 }}>PLAN ACTIVO</div>
          <div style={{ fontFamily: F.serif, fontSize: isMobile ? 18 : 22, fontWeight: 400 }}>{tier.name}</div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>{tier.commission}% comisión · Servicios ilimitados · $20 USD/mes</div>
        </div>
        <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4 }}>Saldo CTG (comisiones)</div>
          <div style={{ fontFamily: F.serif, fontSize: isMobile ? 20 : 24, fontWeight: 400, color: T.gold }}>842.50 CTG</div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>≈ $353.850 COP</div>
        </div>
        {!isMobile && <Btn variant="ghost" size="sm" onClick={() => setShowChat(true)}>💬 Chat cliente</Btn>}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiColumns, gap: 14, marginBottom: 24 }}>
        <Metric label="CITAS HOY" value="6" accent={T.sage} />
        <Metric label="INGRESOS HOY" value="$485K" sub="Neto 3% comm." accent={T.gold} />
        <Metric label="CALIFICACIÓN" value="4.9 ★" accent={T.goldLt} />
        <Metric label="TRANSF. PENDIENTES" value="2" sub="Requieren verificación" accent={T.warn} />
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: mainColumns, gap: 16 }}>
        {/* Schedule */}
        <div style={cardStyle}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}` }}>
            <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>Agenda de hoy</div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {[
              { h: '09:00', pac: 'Max — Laura G.', tipo: 'Consulta', pay: 'CTG', st: 'Completada' },
              { h: '10:30', pac: 'Luna — Carlos R.', tipo: 'Vacunación', pay: 'TRANSFER', st: 'Verificar' },
              { h: '12:00', pac: 'Buddy — Sofía H.', tipo: 'Revisión', pay: 'PSE', st: 'Confirmada' },
              { h: '15:30', pac: 'Nala — Miguel T.', tipo: 'Consulta', pay: 'CTG', st: 'Pendiente' },
            ].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '10px 16px' : '12px 22px', borderBottom: i < 3 ? `1px solid ${T.line}` : 'none' }}>
                <div style={{ fontFamily: F.mono, fontSize: 13, color: T.inkMuted, width: isMobile ? 36 : 44, flexShrink: 0 }}>{c.h}</div>
                <div style={{ width: 2, height: isMobile ? 32 : 38, borderRadius: 1, background: c.st === 'Completada' ? T.lineHi : c.st === 'Verificar' ? T.warn : T.sage, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: isMobile ? 12.5 : 13.5, fontWeight: 500 }}>{c.pac}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>{c.tipo}</div>
                </div>
                {!isMobile && <PayBadge m={c.pay} />}
                {c.st === 'Verificar' ? (
                  <Btn size="sm" variant="ghost">Verificar</Btn>
                ) : (
                  <Badge variant={c.st === 'Completada' ? 'default' : c.st === 'Confirmada' ? 'ok' : 'warn'}>{c.st}</Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Clinical record */}
          <div style={cardStyle}>
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>Registro clínico</div>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 14 }}>
                <Field label="Paciente">
                  <select style={{ width: '100%', padding: '10px 14px', background: T.surfaceAlt, border: `1px solid ${T.line}`, borderRadius: 8, color: T.ink, fontSize: 14, fontFamily: F.sans, marginTop: 6 }}>
                    <option>Max — Golden Retriever (Laura Gómez)</option>
                  </select>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <Field label="Diagnóstico">
                  <input style={{ width: '100%', padding: '10px 14px', background: T.surfaceAlt, border: `1px solid ${T.line}`, borderRadius: 8, color: T.ink, fontSize: 14, marginTop: 6 }} placeholder="Diagnóstico…" />
                </Field>
                <Field label="Peso">
                  <input style={{ width: '100%', padding: '10px 14px', background: T.surfaceAlt, border: `1px solid ${T.line}`, borderRadius: 8, color: T.ink, fontSize: 14, marginTop: 6 }} placeholder="28.5 kg" />
                </Field>
              </div>
              <div style={{ marginBottom: 14 }}>
                <Field label="Tratamiento">
                  <textarea style={{ width: '100%', padding: '10px 14px', background: T.surfaceAlt, border: `1px solid ${T.line}`, borderRadius: 8, color: T.ink, fontSize: 14, minHeight: 60, resize: 'none', marginTop: 6 }} placeholder="Medicamentos, dosis…" />
                </Field>
              </div>
              <Btn full>Guardar registro</Btn>
            </div>
          </div>

          {/* Private price list */}
          <div style={cardStyle}>
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>Lista de precios privada</div>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>Solo visible para clientes a través del chat arbitrado</div>
            </div>
            <div style={{ padding: '8px 0' }}>
              {[
                { s: 'Consulta domiciliaria', p: 85000 },
                { s: 'Vacunación', p: 65000 },
                { s: 'Urgencia domiciliaria', p: 150000 },
              ].map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 22px', borderBottom: i < 2 ? `1px solid ${T.line}` : 'none', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <span style={{ fontSize: 13.5, color: T.ink, flex: isMobile ? '1 1 100%' : 1, marginBottom: isMobile ? 8 : 0 }}>{p.s}</span>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontFamily: F.mono, fontSize: 13, color: T.sage }}>${p.p.toLocaleString('es-CO')}</span>
                    <span style={{ fontFamily: F.sans, fontSize: 12, color: T.gold }}>≈{Math.round(p.p / 420)} CTG</span>
                    <Btn size="sm" variant="ghost">✎</Btn>
                  </div>
                </div>
              ))}
              <div style={{ padding: '12px 22px' }}>
                <Btn size="sm" variant="ghost" full>+ Agregar servicio</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
