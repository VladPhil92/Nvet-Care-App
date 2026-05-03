import { useState } from 'react'
import { T, F, TIERS, SPACING } from '../theme/tokens'
import { Btn, Badge, Bar, Hr, cardStyle } from '../components/UI'
import { useResponsive } from '../hooks/useResponsive'

export default function TiersPage() {
  const [current, setCurrent] = useState<'free' | 'pro' | 'elite'>('pro')
  const { isMobile, isTablet, isDesktop } = useResponsive()

  const containerPadding = isMobile ? `${SPACING.mobile.gutter}px` : isTablet ? `${SPACING.tablet.gutter}px` : `${SPACING.desktop.gutter}px`
  const tiersColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : '1fr 1.15fr 1.3fr'
  const calcColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : '1fr 1fr 1fr'

  return (
    <div style={{ padding: containerPadding }}>
      {/* Header */}
      <div style={{ marginBottom: 36, maxWidth: 560 }}>
        <div style={{
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 600,
          color: T.inkMuted,
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}>
          PLANES VETERINARIOS
        </div>
        <div style={{
          fontFamily: F.serif,
          fontSize: 36,
          fontWeight: 300,
          color: T.ink,
          lineHeight: 1.2,
          marginBottom: 12,
        }}>
          Elige el nivel que<br />
          <em>impulsa tu práctica</em>
        </div>
        <div style={{ fontSize: 15, color: T.inkSec, lineHeight: 1.6 }}>
          Las comisiones se descuentan automáticamente en CTG Token según el nivel de suscripción activo.
        </div>
      </div>

      {/* Tier cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: tiersColumns,
        gap: isMobile ? 16 : 20,
        marginBottom: 36,
        alignItems: 'start',
      }}>
        {/* En tablet, Elite va solo en la tercera fila */}
        {Object.values(TIERS).map((tier, idx) => {
          const active = current === tier.id
          const isElite = tier.id === 'elite'
          return (
            <div
              key={tier.id}
              style={{
                ...cardStyle,
                border: `1.5px solid ${active || isElite ? tier.color + '60' : T.line}`,
                boxShadow: isElite ? '0 8px 32px rgba(184,150,46,.12)' : 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isElite && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: `linear-gradient(90deg,${T.gold},${T.goldLt})`,
                }} />
              )}
              {isElite && (
                <div style={{ position: 'absolute', top: 14, right: 14 }}>
                  <Badge variant="gold">Mejor valor</Badge>
                </div>
              )}
              <div style={{ padding: '28px 28px 24px' }}>
                <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: tier.color,
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}>
                  {tier.badge}
                </div>
                <div style={{
                  fontFamily: F.serif,
                  fontSize: isElite ? 32 : 26,
                  fontWeight: 300,
                  color: T.ink,
                  marginBottom: 20,
                }}>
                  {tier.name}
                </div>

                {/* Price */}
                <div style={{ marginBottom: 20 }}>
                  {tier.price === 0 ? (
                    <div style={{ fontFamily: F.serif, fontSize: 40, fontWeight: 300, color: T.ink }}>Gratis</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontFamily: F.serif, fontSize: 40, fontWeight: 300, color: tier.color }}>
                          ${tier.price}
                        </span>
                        <span style={{ fontSize: 13, color: T.inkMuted }}>USD / mes</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 3 }}>
                        ≈ ${tier.priceCOP.toLocaleString('es-CO')} COP
                      </div>
                    </>
                  )}
                </div>

                {/* Commission highlight */}
                <div style={{
                  background: `${tier.color}0A`,
                  border: `1px solid ${tier.color}30`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  marginBottom: 20,
                }}>
                  <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 600,
                    color: tier.color,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}>
                    COMISIÓN POR SERVICIO
                  </div>
                  <div style={{
                    fontFamily: F.serif,
                    fontSize: isElite ? 44 : 36,
                    fontWeight: 300,
                    color: tier.color,
                    lineHeight: 1,
                  }}>
                    {tier.commission}%
                  </div>
                  {tier.limit && (
                    <div style={{ fontFamily: F.sans, fontSize: 12, color: T.warn, marginTop: 6 }}>
                      Límite: {tier.limit} servicios/mes
                    </div>
                  )}
                </div>

                {/* Benefits */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {tier.perks.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: `${tier.color}20`,
                        border: `1px solid ${tier.color}50`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        color: tier.color,
                        flexShrink: 0,
                        marginTop: 2,
                      }}>
                        ✓
                      </div>
                      <span style={{ fontSize: 13, color: T.inkSec, lineHeight: 1.4 }}>{b}</span>
                    </div>
                  ))}
                </div>

                <Btn
                  full
                  variant={active ? (isElite ? 'gold' : 'primary') : 'ghost'}
                  onClick={() => setCurrent(tier.id as 'free' | 'pro' | 'elite')}
                >
                  {active ? 'Plan activo' : `Activar ${tier.name}`}
                </Btn>
              </div>
            </div>
          )
        })}
      </div>

      {/* Commission calculator */}
      <div style={cardStyle}>
        <div style={{ padding: '20px 28px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>
            Calculadora de rentabilidad neta
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 4 }}>
            Estimación con $1.000.000 COP en servicios mensuales
          </div>
        </div>
        <div style={{ padding: isMobile ? '16px 20px' : '20px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: calcColumns, gap: 16 }}>
            {Object.values(TIERS).map((tier) => {
              const gross = 1000000
              const commAmt = gross * tier.commission / 100
              const subAmt = tier.priceCOP
              const net = gross - commAmt - subAmt
              const pct = Math.round((net / gross) * 100)
              return (
                <div
                  key={tier.id}
                  style={{
                    background: T.surfaceAlt,
                    borderRadius: 10,
                    padding: '18px 20px',
                    border: `1px solid ${tier.id === current ? tier.color + '50' : T.line}`,
                  }}
                >
                  <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 600,
                    color: tier.color,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    marginBottom: 12,
                  }}>
                    {tier.name}
                  </div>
                  <div style={{ fontSize: 12, color: T.err, marginBottom: 4 }}>
                    – ${commAmt.toLocaleString('es-CO')} comisión ({tier.commission}%)
                  </div>
                  {tier.price > 0 && (
                    <div style={{ fontSize: 12, color: T.warn, marginBottom: 4 }}>
                      – ${subAmt.toLocaleString('es-CO')} suscripción
                    </div>
                  )}
                  <Hr my={10} />
                  <div style={{ fontFamily: F.serif, fontSize: 22, color: T.sage, fontWeight: 400 }}>
                    ${net.toLocaleString('es-CO')}
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 4 }}>
                    Neto · {pct}% del bruto
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Bar pct={pct} color={tier.color} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
