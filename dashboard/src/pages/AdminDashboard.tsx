import { T, F, SPACING } from '../theme/tokens'
import { Metric, Bar, cardStyle, Badge } from '../components/UI'
import { PayBadge, TierBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'
import {
  useMetricsQuery,
  useTransferTrackingQuery,
  useAdminAppointmentsQuery,
  usePaymentMethodStatsQuery,
} from '../hooks/queries/useAdminQueries'
import { useVerifyTransferMutation } from '../hooks/queries/useAdminMutations'
import { adminService } from '../services/admin.service'

function Skeleton({ w = '80px', h = '24px' }: { w?: string; h?: string }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        background: T.surfaceAlt,
        borderRadius: 6,
        display: 'inline-block',
        animation: 'pulse 1.4s ease-in-out infinite',
      }}
    />
  )
}

function formatCOP(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)} K`
  return `$${n.toLocaleString('es-CO')}`
}

export default function AdminDashboard() {
  const { isMobile, isTablet, isDesktop } = useResponsive()

  const containerPadding = isMobile
    ? `${SPACING.mobile.gutter}px`
    : isTablet
      ? `${SPACING.tablet.gutter}px`
      : `${SPACING.desktop.gutter}px`

  const kpiColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'
  const panelColumns = isDesktop ? '1fr 1fr' : '1fr'

  const metricsQ = useMetricsQuery()
  const transferQ = useTransferTrackingQuery({ refetchInterval: 30_000 })
  const appointmentsQ = useAdminAppointmentsQuery({ limit: 5 } as any)
  const paymentStatsQ = usePaymentMethodStatsQuery()
  const verifyTransferM = useVerifyTransferMutation()

  const metrics = metricsQ.data
  const transfers = transferQ.data ?? []
  const appointments = appointmentsQ.data ?? []
  const paymentStats = paymentStatsQ.data ?? []

  const paymentRows =
    paymentStats.length > 0
      ? paymentStats.map((s) => ({
          label: s.method === 'CTG' ? 'CTG One Token' : s.method === 'PSE' ? 'PSE' : 'Transferencia',
          pct: Math.round(s.percentage),
          val: formatCOP(s.amount),
          color: s.method === 'CTG' ? T.gold : s.method === 'PSE' ? T.payPSE : T.payTRF,
          badge: (s.method === 'CTG' ? 'gold' : s.method === 'PSE' ? 'pse' : 'trf') as 'gold' | 'pse' | 'trf',
        }))
      : [
          { label: 'CTG One Token', pct: 48, val: '—', color: T.gold, badge: 'gold' as const },
          { label: 'PSE', pct: 32, val: '—', color: T.payPSE, badge: 'pse' as const },
          { label: 'Transferencia', pct: 20, val: '—', color: T.payTRF, badge: 'trf' as const },
        ]

  const openTransferProof = async (transactionId: string) => {
    try {
      const blob = await adminService.getTransferProof(transactionId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.click()
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
    } catch (error: any) {
      window.alert(error?.response?.data?.message || 'No fue posible abrir el comprobante.')
    }
  }

  const approveTransfer = async (transactionId: string) => {
    if (!window.confirm('¿Confirmar que el comprobante corresponde al pago recibido?')) return
    try {
      await verifyTransferM.mutateAsync({ transactionId, action: 'CONFIRM' })
    } catch (error: any) {
      window.alert(error?.response?.data?.message || 'No fue posible aprobar la transferencia.')
    }
  }

  const rejectTransfer = async (transactionId: string) => {
    const reason = window.prompt(
      'Motivo del rechazo (mínimo 10 caracteres). Este mensaje será visible para el cliente:',
    )
    if (reason === null) return
    if (reason.trim().length < 10) {
      window.alert('El motivo de rechazo debe tener al menos 10 caracteres.')
      return
    }
    try {
      await verifyTransferM.mutateAsync({
        transactionId,
        action: 'REJECT',
        reason: reason.trim(),
      })
    } catch (error: any) {
      window.alert(error?.response?.data?.message || 'No fue posible rechazar la transferencia.')
    }
  }

  return (
    <div style={{ padding: containerPadding }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      <div style={{ display: 'grid', gridTemplateColumns: kpiColumns, gap: 14, marginBottom: 24 }}>
        <Metric
          label="CITAS HOY"
          value={metricsQ.isLoading ? '…' : String(metrics?.citasHoy ?? 0)}
          sub={metricsQ.isError ? 'Error al cargar' : undefined}
          accent={T.sage}
        />
        <Metric
          label="VETERINARIOS ACTIVOS"
          value={metricsQ.isLoading ? '…' : String(metrics?.veterinariosActivos ?? 0)}
          sub={metricsQ.isLoading ? undefined : ''}
          accent={T.sageLt}
        />
        <Metric
          label="VOLUMEN CTG HOY"
          value={metricsQ.isLoading ? '…' : String(metrics?.volumenCtgHoy ?? 0)}
          sub={metrics ? `≈ ${formatCOP((metrics.volumenCtgHoy ?? 0) * 420)} COP` : undefined}
          accent={T.gold}
        />
        <Metric
          label="COMISIONES HOY"
          value={metricsQ.isLoading ? '…' : formatCOP(metrics?.comisionesHoy ?? 0)}
          sub="CTG + fiat"
          accent={T.goldLt}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: panelColumns, gap: 16, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}` }}>
            <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>
              Ingresos por método de pago
            </div>
          </div>
          <div style={{ padding: '20px 22px' }}>
            {paymentStatsQ.isLoading
              ? [1, 2, 3].map((i) => (
                  <div key={i} style={{ marginBottom: 18 }}>
                    <Skeleton w="120px" h="16px" />
                    <div style={{ marginTop: 8 }}>
                      <Skeleton w="100%" h="8px" />
                    </div>
                  </div>
                ))
              : paymentRows.map((r, i) => (
                  <div key={i} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Badge variant={r.badge}>{r.label}</Badge>
                        <span style={{ fontFamily: F.mono, fontSize: 12, color: T.inkMuted }}>
                          {r.pct}%
                        </span>
                      </span>
                      <span style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 400, color: T.ink }}>
                        {r.val}
                      </span>
                    </div>
                    <Bar pct={r.pct} color={r.color} />
                  </div>
                ))}
          </div>
        </div>

        <div style={cardStyle}>
          <div
            style={{
              padding: '18px 22px',
              borderBottom: `1px solid ${T.line}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>
              Transferencias — trazabilidad
            </div>
            <Badge variant="warn">En vivo</Badge>
          </div>
          <div style={{ padding: '8px 0' }}>
            {transferQ.isLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} style={{ padding: '14px 22px', borderBottom: `1px solid ${T.line}` }}>
                  <Skeleton w="180px" h="14px" />
                </div>
              ))
            ) : transfers.length === 0 ? (
              <div style={{ padding: '20px 22px', color: T.inkMuted, fontFamily: F.sans, fontSize: 13 }}>
                No hay transferencias pendientes
              </div>
            ) : (
              transfers.slice(0, 5).map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    padding: '12px 22px',
                    borderBottom: i < transfers.length - 1 ? `1px solid ${T.line}` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <TierBadge t={r.tier} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: T.ink }}>{r.vet}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>
                        {r.client}
                        {r.transferCode ? ` · Ref. ${r.transferCode}` : ''}
                      </div>
                    </div>
                    <span style={{ fontFamily: F.mono, fontSize: 13, color: T.sage }}>
                      ${r.amount.toLocaleString('es-CO')}
                    </span>
                    <Badge variant={r.rawStatus === 'VERIFYING' ? 'warn' : 'default'}>
                      {r.rawStatus === 'VERIFYING' ? 'Verificando' : 'Esperando comprobante'}
                    </Badge>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 10,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontFamily: F.sans, fontSize: 11, color: T.inkMuted }}>
                      {r.waitingMinutes} min en cola
                    </span>
                    {r.proofAvailable ? (
                      <button
                        type="button"
                        onClick={() => openTransferProof(r.id)}
                        style={{
                          border: `1px solid ${T.line}`,
                          background: T.surfaceAlt,
                          color: T.ink,
                          borderRadius: 7,
                          padding: '6px 9px',
                          cursor: 'pointer',
                        }}
                      >
                        Ver comprobante
                      </button>
                    ) : null}
                    {r.rawStatus === 'VERIFYING' ? (
                      <>
                        <button
                          type="button"
                          disabled={verifyTransferM.isPending}
                          onClick={() => approveTransfer(r.id)}
                          style={{
                            border: 'none',
                            background: T.sage,
                            color: '#fff',
                            borderRadius: 7,
                            padding: '6px 9px',
                            cursor: verifyTransferM.isPending ? 'wait' : 'pointer',
                            opacity: verifyTransferM.isPending ? 0.6 : 1,
                          }}
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          disabled={verifyTransferM.isPending}
                          onClick={() => rejectTransfer(r.id)}
                          style={{
                            border: `1px solid ${T.danger ?? '#b91c1c'}`,
                            background: 'transparent',
                            color: T.danger ?? '#b91c1c',
                            borderRadius: 7,
                            padding: '6px 9px',
                            cursor: verifyTransferM.isPending ? 'wait' : 'pointer',
                            opacity: verifyTransferM.isPending ? 0.6 : 1,
                          }}
                        >
                          Rechazar
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div
          style={{
            padding: '18px 22px',
            borderBottom: `1px solid ${T.line}`,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>
            Citas recientes
          </div>
        </div>

        {appointmentsQ.isLoading ? (
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} w="100%" h="16px" />)}
          </div>
        ) : appointments.length === 0 ? (
          <div style={{ padding: '20px 22px', color: T.inkMuted, fontFamily: F.sans, fontSize: 13 }}>
            Sin citas recientes
          </div>
        ) : isMobile ? (
          <div style={{ padding: '8px 0' }}>
            {appointments.map((r, i) => (
              <div
                key={r.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: i < appointments.length - 1 ? `1px solid ${T.line}` : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: F.mono, fontSize: 13, color: T.inkMuted }}>{r.id}</span>
                  <Badge
                    variant={
                      r.status === 'Completada'
                        ? 'ok'
                        : r.status === 'Verificando'
                          ? 'warn'
                          : r.status === 'En camino'
                            ? 'sage'
                            : 'default'
                    }
                  >
                    {r.status}
                  </Badge>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
                      {r.patient}
                    </div>
                    <div style={{ fontSize: 12, color: T.inkSec }}>{r.vet}</div>
                  </div>
                  <TierBadge t={r.tier} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      background: T.surfaceAlt,
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {r.service}
                  </span>
                  <PayBadge m={r.paymentMethod} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.surfaceAlt }}>
                  {(isTablet
                    ? ['Paciente', 'Veterinario', 'Tier', 'Servicio', 'Estado']
                    : ['ID', 'Paciente', 'Veterinario', 'Tier', 'Servicio', 'Método', 'Estado']
                  ).map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 600,
                        color: T.inkMuted,
                        letterSpacing: '1.2px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appointments.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                    {!isTablet && (
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontFamily: F.mono }}>{r.id.slice(0, 8)}</span>
                      </td>
                    )}
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{r.patient}</td>
                    <td style={{ padding: '12px 16px', color: T.inkSec }}>{r.vet}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <TierBadge t={r.tier} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          background: T.surfaceAlt,
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {r.service}
                      </span>
                    </td>
                    {!isTablet && (
                      <td style={{ padding: '12px 16px' }}>
                        <PayBadge m={r.paymentMethod} />
                      </td>
                    )}
                    <td style={{ padding: '12px 16px' }}>
                      <Badge
                        variant={
                          r.status === 'Completada'
                            ? 'ok'
                            : r.status === 'Verificando'
                              ? 'warn'
                              : r.status === 'En camino'
                                ? 'sage'
                                : 'default'
                        }
                      >
                        {r.status}
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
