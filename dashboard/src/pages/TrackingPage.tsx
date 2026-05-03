import { useState } from 'react'
import { T, F, SPACING } from '../theme/tokens'
import { Badge, Bar, cardStyle, Btn } from '../components/UI'
import { PayBadge, TierBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'

export default function TrackingPage() {
  const [expanded, setExpanded] = useState(0)
  const { isMobile, isTablet } = useResponsive()
  const containerPadding = isMobile ? `${SPACING.mobile.gutter}px` : isTablet ? `${SPACING.tablet.gutter}px` : `${SPACING.desktop.gutter}px`

  const apts = [
    { id: '#C0047', vet: 'Dra. Valeria Ospina', tier: 'elite' as const, pet: '🐕 Max', svc: 'Consulta domiciliaria', date: 'Hoy · 14:00', pay: 'CTG', st: 'En camino', pct: 60, eta: '12 min', amount: 85000 },
    { id: '#C0048', vet: 'Dr. Andrés Mora', tier: 'pro' as const, pet: '🐈 Mochi', svc: 'Vacunación', date: 'Lun · 10:30', pay: 'TRANSFER', st: 'Confirmada', pct: 20, eta: 'Mañana', amount: 65000 },
    { id: '#C0049', vet: 'Dra. Carolina Ríos', tier: 'free' as const, pet: '🐕 Max', svc: 'Revisión preventiva', date: 'Vie · 09:00', pay: 'PSE', st: 'Pendiente', pct: 5, eta: '6 días', amount: 75000 },
  ]

  const stages = ['Confirmada', 'Pago', 'En camino', 'Llegó', 'Completada']

  return (
    <div style={{ padding: containerPadding }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: isMobile ? 'wrap' : 'nowrap', gap: 16 }}>
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 6 }}>SEGUIMIENTO</div>
          <div style={{ fontFamily: F.serif, fontSize: isMobile ? 22 : 28, fontWeight: 300 }}>Mis citas</div>
        </div>
        <Btn onClick={() => {}}>+ Nueva cita</Btn>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {apts.map((apt, i) => {
          const open = expanded === i
          const sidx = Math.ceil(apt.pct / 20)
          return (
            <div key={i} style={{ ...cardStyle, border: `1.5px solid ${open && apt.st === 'En camino' ? T.sage : T.line}`, transition: 'border .2s' }}>
              {/* Summary row */}
              <div
                style={{
                  padding: isMobile ? '14px 16px' : '18px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? 8 : 16,
                  cursor: 'pointer',
                  flexWrap: isMobile ? 'wrap' : 'nowrap'
                }}
                onClick={() => setExpanded(open ? -1 : i)}
              >
                <div style={{ fontFamily: F.mono, fontSize: 12, color: T.inkMuted, width: isMobile ? '100%' : 56, flexShrink: isMobile ? 1 : 0, marginBottom: isMobile ? 8 : 0 }}>
                  {apt.id}
                </div>
                <div style={{ flex: 1, minWidth: isMobile ? '100%' : 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{apt.vet}</span>
                    <TierBadge t={apt.tier} />
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>
                    {apt.pet} · {apt.svc} · {apt.date}
                  </div>
                </div>
                {!isMobile && (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <PayBadge m={apt.pay} />
                      <Badge variant={apt.st === 'En camino' ? 'sage' : apt.st === 'Confirmada' ? 'ok' : 'default'}>{apt.st}</Badge>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                      <div style={{ fontFamily: F.serif, fontSize: 16, color: T.sage }}>{apt.eta}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>ETA</div>
                    </div>
                  </>
                )}
                <div style={{ color: T.inkMuted, fontSize: 16, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>⌄</div>
              </div>

              {/* Expandable detail */}
              {open && (
                <div style={{ padding: isMobile ? '0 16px 16px' : '0 24px 20px' }}>
                  <Bar pct={apt.pct} color={apt.st === 'En camino' ? T.sage : T.gold} />
                  {/* Progress stages */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, marginBottom: 20, overflowX: isMobile ? 'auto' : 'visible' }}>
                    {stages.map((st, j) => (
                      <div key={j} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: isMobile ? 60 : 'auto' }}>
                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: sidx > j ? T.sage : T.surfaceAlt,
                          border: `1.5px solid ${sidx > j ? T.sage : T.line}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          color: sidx > j ? T.inkInv : T.inkMuted
                        }}>
                          {sidx > j ? '✓' : j + 1}
                        </div>
                        <div style={{ fontSize: 10, color: sidx > j ? T.sage : T.inkMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>{st}</div>
                      </div>
                    ))}
                  </div>
                  {/* Map placeholder */}
                  <div style={{
                    background: T.surfaceAlt,
                    borderRadius: 10,
                    height: isMobile ? 90 : 110,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    border: `1px solid ${T.line}`
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 28 }}>⊙</div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 6 }}>Mapa en tiempo real</div>
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {apt.pay === 'TRANSFER' && (
                      <Btn variant="ghost" size="sm" onClick={() => {}}>→ Verificar transferencia</Btn>
                    )}
                    <Btn variant="ghost" size="sm">💬 Chat con vet</Btn>
                    {!isMobile && <div style={{ marginLeft: 'auto' }}>
                      <Btn variant="ghost" size="sm">Cancelar cita</Btn>
                    </div>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
