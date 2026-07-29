import { useState } from 'react'
import { T, F, SPACING } from '../theme/tokens'
import { Badge, Bar, cardStyle, Btn } from '../components/UI'
import { PayBadge, TierBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'
import { useAdminAppointmentsQuery } from '../hooks/queries/useAdminQueries'

const STATUS_PCT: Record<string, number> = {
  Pendiente: 10,
  Confirmada: 25,
  Verificando: 40,
  'En camino': 60,
  Llegó: 80,
  Completada: 100,
}

const STAGES = ['Confirmada', 'Pago', 'En camino', 'Llegó', 'Completada']

function SkeletonCard() {
  return (
    <div style={{ ...cardStyle, padding: '18px 24px', opacity: 0.5 }}>
      <div style={{ height: 16, background: T.surfaceAlt, borderRadius: 6, width: '50%', marginBottom: 10 }} />
      <div style={{ height: 12, background: T.surfaceAlt, borderRadius: 6, width: '75%' }} />
    </div>
  )
}

export default function TrackingPage() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const { isMobile, isTablet } = useResponsive()
  const containerPadding = isMobile
    ? `${SPACING.mobile.gutter}px`
    : isTablet
      ? `${SPACING.tablet.gutter}px`
      : `${SPACING.desktop.gutter}px`

  const appointmentsQ = useAdminAppointmentsQuery({ limit: 20 } as any)
  const apts = appointmentsQ.data ?? []

  return (
    <div style={{ padding: containerPadding }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 28,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 600,
              color: T.inkMuted,
              letterSpacing: '1.2px',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            SEGUIMIENTO
          </div>
          <div style={{ fontFamily: F.serif, fontSize: isMobile ? 22 : 28, fontWeight: 300 }}>
            Citas en curso
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {appointmentsQ.isFetching && (
            <span style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>
              Actualizando…
            </span>
          )}
          <Btn size="sm" variant="ghost" onClick={() => appointmentsQ.refetch()}>
            ↻ Refrescar
          </Btn>
        </div>
      </div>

      {appointmentsQ.isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : appointmentsQ.isError ? (
        <div style={{ ...cardStyle, padding: '24px', color: T.err, fontFamily: F.sans, fontSize: 13 }}>
          Error al cargar citas. Intenta refrescar.
        </div>
      ) : apts.length === 0 ? (
        <div style={{ ...cardStyle, padding: '32px 24px', textAlign: 'center', color: T.inkMuted, fontFamily: F.sans, fontSize: 14 }}>
          No hay citas activas en este momento.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {apts.map((apt) => {
            const pct = STATUS_PCT[apt.status] ?? 50
            const sidx = Math.ceil(pct / 20)
            const open = expanded === apt.id

            return (
              <div
                key={apt.id}
                style={{
                  ...cardStyle,
                  border: `1.5px solid ${open && apt.status === 'En camino' ? T.sage : T.line}`,
                  transition: 'border .2s',
                }}
              >
                {/* Summary row */}
                <div
                  style={{
                    padding: isMobile ? '14px 16px' : '18px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? 8 : 16,
                    cursor: 'pointer',
                    flexWrap: isMobile ? 'wrap' : 'nowrap',
                  }}
                  onClick={() => setExpanded(open ? null : apt.id)}
                >
                  <div
                    style={{
                      fontFamily: F.mono,
                      fontSize: 12,
                      color: T.inkMuted,
                      width: isMobile ? '100%' : 56,
                      flexShrink: isMobile ? 1 : 0,
                      marginBottom: isMobile ? 8 : 0,
                    }}
                  >
                    {apt.id.slice(0, 8)}
                  </div>

                  <div style={{ flex: 1, minWidth: isMobile ? '100%' : 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{apt.vet}</span>
                      <TierBadge t={apt.tier} />
                    </div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>
                      {apt.patient} · {apt.service} · {apt.date}
                    </div>
                  </div>

                  {!isMobile && (
                    <>
                      <PayBadge m={apt.paymentMethod} />
                      <div style={{ width: 120, flexShrink: 0 }}>
                        <Bar pct={pct} color={T.sage} thin />
                      </div>
                    </>
                  )}

                  <Badge
                    variant={
                      apt.status === 'Completada'
                        ? 'ok'
                        : apt.status === 'En camino'
                          ? 'sage'
                          : apt.status === 'Verificando'
                            ? 'warn'
                            : 'default'
                    }
                  >
                    {apt.status}
                  </Badge>

                  <span
                    style={{
                      color: T.inkMuted,
                      transition: 'transform .15s',
                      transform: open ? 'rotate(180deg)' : 'none',
                    }}
                  >
                    ⌄
                  </span>
                </div>

                {/* Accordion: stages */}
                {open && (
                  <div
                    style={{
                      padding: isMobile ? '16px' : '20px 24px',
                      borderTop: `1px solid ${T.line}`,
                      background: T.surfaceAlt,
                    }}
                  >
                    {isMobile && (
                      <div style={{ marginBottom: 16 }}>
                        <Bar pct={pct} color={T.sage} />
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: isMobile ? 4 : 0,
                        flexWrap: isMobile ? 'wrap' : 'nowrap',
                      }}
                    >
                      {STAGES.map((stage, si) => {
                        const done = si < sidx
                        const current = si === sidx - 1
                        return (
                          <div
                            key={stage}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              flex: 1,
                              minWidth: isMobile ? '30%' : 'auto',
                              marginBottom: isMobile ? 12 : 0,
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                background: done || current ? T.sage : T.surfaceAlt,
                                border: `2px solid ${done || current ? T.sage : T.line}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 6,
                                fontSize: 12,
                                color: done || current ? '#fff' : T.inkMuted,
                                fontWeight: 700,
                              }}
                            >
                              {done ? '✓' : si + 1}
                            </div>
                            <div
                              style={{
                                fontFamily: F.sans,
                                fontSize: 11,
                                textAlign: 'center',
                                color: done || current ? T.sage : T.inkMuted,
                                fontWeight: current ? 700 : 400,
                              }}
                            >
                              {stage}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Btn size="sm" variant="ghost">Ver detalle</Btn>
                      {apt.status !== 'Completada' && (
                        <Btn size="sm" variant="ghost">Contactar vet</Btn>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
