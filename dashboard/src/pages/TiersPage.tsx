import { useEffect, useMemo, useState } from 'react'
import { T, F, TIERS, SPACING } from '../theme/tokens'
import { Btn, Badge, Bar, Hr, cardStyle } from '../components/UI'
import { useResponsive } from '../hooks/useResponsive'
import { vetService, type MembershipState, type VetTier } from '../services/vet.service'

export default function TiersPage() {
  const [membership, setMembership] = useState<MembershipState | null>(null)
  const [loading, setLoading] = useState(true)
  const [changingTier, setChangingTier] = useState<VetTier | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { isMobile, isTablet } = useResponsive()

  useEffect(() => {
    let alive = true
    vetService.getMembership()
      .then((data) => alive && setMembership(data))
      .catch(() => alive && setError('No pudimos cargar tu membresía.'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const activeId = useMemo(() => {
    const tier = membership?.tier ?? 'FREE'
    return tier.toLowerCase() as 'free' | 'pro' | 'elite'
  }, [membership])

  const requestChange = async (tier: VetTier) => {
    if (!membership || tier === membership.tier || changingTier) return
    setChangingTier(tier)
    setError(null)
    try {
      const next = await vetService.requestMembershipChange(tier)
      setMembership(next)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No pudimos registrar el cambio de membresía.')
    } finally {
      setChangingTier(null)
    }
  }

  const containerPadding = isMobile ? `${SPACING.mobile.gutter}px` : isTablet ? `${SPACING.tablet.gutter}px` : `${SPACING.desktop.gutter}px`
  const tiersColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : '1fr 1.15fr 1.3fr'
  const calcColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : '1fr 1fr 1fr'

  return (
    <div style={{ padding: containerPadding }}>
      <div style={{ marginBottom: 30, maxWidth: 620 }}>
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
          Tú defines el precio final de cada servicio. Nvet aplica la comisión correspondiente al plan activo sobre cada transacción completada.
        </div>
      </div>

      {error && (
        <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 18, border: `1px solid ${T.err}40`, color: T.err, fontSize: 13 }}>
          {error}
        </div>
      )}

      {membership?.status === 'PENDING_CHANGE' && membership.requestedPlan && (
        <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: 18, border: `1px solid ${T.warn}50`, background: `${T.warn}08` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.warn }}>Cambio de plan pendiente</div>
          <div style={{ fontSize: 12, color: T.inkSec, marginTop: 4, lineHeight: 1.5 }}>
            Solicitaste {membership.requestedPlan.name} por ${membership.requestedPlan.monthlyPriceCop.toLocaleString('es-CO')} COP/mes. Tu plan actual y su comisión siguen vigentes hasta confirmar el cobro.
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: tiersColumns,
        gap: isMobile ? 16 : 20,
        marginBottom: 36,
        alignItems: 'start',
        opacity: loading ? 0.65 : 1,
      }}>
        {Object.values(TIERS).map((tier) => {
          const active = activeId === tier.id
          const pending = membership?.requestedTier === tier.apiTier
          const isElite = tier.id === 'elite'
          return (
            <div
              key={tier.id}
              style={{
                ...cardStyle,
                border: `1.5px solid ${active || pending || isElite ? tier.color + '60' : T.line}`,
                boxShadow: isElite ? '0 8px 32px rgba(184,150,46,.12)' : 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isElite && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${T.gold},${T.goldLt})` }} />}
              {active && <div style={{ position: 'absolute', top: 14, right: 14 }}><Badge variant="ok">Plan activo</Badge></div>}
              {pending && !active && <div style={{ position: 'absolute', top: 14, right: 14 }}><Badge variant="warn">Pendiente</Badge></div>}

              <div style={{ padding: '28px 28px 24px' }}>
                <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: tier.color, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 12 }}>
                  {tier.badge}
                </div>
                <div style={{ fontFamily: F.serif, fontSize: isElite ? 32 : 26, fontWeight: 300, color: T.ink, marginBottom: 20 }}>
                  {tier.name}
                </div>

                <div style={{ marginBottom: 20 }}>
                  {tier.priceCOP === 0 ? (
                    <div style={{ fontFamily: F.serif, fontSize: 40, fontWeight: 300, color: T.ink }}>Gratis</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: F.serif, fontSize: 38, fontWeight: 300, color: tier.color }}>
                        ${tier.priceCOP.toLocaleString('es-CO')}
                      </span>
                      <span style={{ fontSize: 13, color: T.inkMuted }}>COP / mes</span>
                    </div>
                  )}
                </div>

                <div style={{ background: `${tier.color}0A`, border: `1px solid ${tier.color}30`, borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                  <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: tier.color, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 6 }}>
                    COMISIÓN POR TRANSACCIÓN
                  </div>
                  <div style={{ fontFamily: F.serif, fontSize: isElite ? 44 : 36, fontWeight: 300, color: tier.color, lineHeight: 1 }}>
                    {tier.commission}%
                  </div>
                  <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 7 }}>
                    Sin límite de servicios ni de citas.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {tier.perks.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: `${tier.color}20`, border: `1px solid ${tier.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: tier.color, flexShrink: 0, marginTop: 2 }}>✓</div>
                      <span style={{ fontSize: 13, color: T.inkSec, lineHeight: 1.4 }}>{b}</span>
                    </div>
                  ))}
                </div>

                <Btn
                  full
                  disabled={loading || active || pending || changingTier !== null}
                  variant={active ? (isElite ? 'gold' : 'primary') : 'ghost'}
                  onClick={() => requestChange(tier.apiTier)}
                >
                  {active
                    ? 'Plan activo'
                    : pending
                      ? 'Cambio pendiente'
                      : changingTier === tier.apiTier
                        ? 'Registrando…'
                        : tier.apiTier === 'FREE'
                          ? 'Cambiar a Free Vet'
                          : `Solicitar ${tier.name}`}
                </Btn>
              </div>
            </div>
          )
        })}
      </div>

      <div style={cardStyle}>
        <div style={{ padding: '20px 28px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>
            Calculadora de rentabilidad neta
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 4 }}>
            Estimación con $1.000.000 COP en servicios mensuales. No incluye impuestos ni costos del medio de pago.
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
                <div key={tier.id} style={{ background: T.surfaceAlt, borderRadius: 10, padding: '18px 20px', border: `1px solid ${tier.id === activeId ? tier.color + '50' : T.line}` }}>
                  <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: tier.color, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 12 }}>
                    {tier.name}
                  </div>
                  <div style={{ fontSize: 12, color: T.err, marginBottom: 4 }}>
                    – ${commAmt.toLocaleString('es-CO')} comisión ({tier.commission}%)
                  </div>
                  {tier.priceCOP > 0 && (
                    <div style={{ fontSize: 12, color: T.warn, marginBottom: 4 }}>
                      – ${subAmt.toLocaleString('es-CO')} membresía
                    </div>
                  )}
                  <Hr my={10} />
                  <div style={{ fontFamily: F.serif, fontSize: 22, color: T.sage, fontWeight: 400 }}>
                    ${net.toLocaleString('es-CO')}
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 4 }}>
                    Neto estimado · {pct}% del bruto
                  </div>
                  <div style={{ marginTop: 12 }}><Bar pct={pct} color={tier.color} /></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
