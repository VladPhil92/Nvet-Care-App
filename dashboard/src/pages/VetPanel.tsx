import { useState } from 'react'
import { T, F, SPACING, TIERS } from '../theme/tokens'
import { Metric, Field, Badge, cardStyle, Btn } from '../components/UI'
import { PayBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'
import {
  useMetricsQuery,
  useTransferTrackingQuery,
  useAdminAppointmentsQuery,
} from '../hooks/queries/useAdminQueries'

function formatCOP(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)} K`
  return `$${n.toLocaleString('es-CO')}`
}

export default function VetPanel() {
  const [_showChat, setShowChat] = useState(false)
  const { isMobile, isTablet } = useResponsive()

  const tier = TIERS.elite
  const containerPadding = isMobile
    ? `${SPACING.mobile.gutter}px`
    : isTablet
      ? `${SPACING.tablet.gutter}px`
      : `${SPACING.desktop.gutter}px`
  const kpiColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'
  const mainColumns = isMobile || isTablet ? '1fr' : '1fr 1fr'

  const metricsQ = useMetricsQuery()
  const transferQ = useTransferTrackingQuery()
  const appointmentsQ = useAdminAppointmentsQuery({ limit: 8 } as any)

  const metrics = metricsQ.data
  const transfers = transferQ.data ?? []
  const apts = appointmentsQ.data ?? []
  const pendingTransfers = transfers.filter((t) => t.status === 'Pendiente').length

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
        borderLeft: `3px solid ${tier.color}`,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: tier.color, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4 }}>PLAN ACTIVO</div>
          <div style={{ fontFamily: F.serif, fontSize: isMobile ? 18 : 22, fontWeight: 400 }}>{tier.name}</div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginTop: 3 }}>{tier.commission}% comisión · Servicios ilimitados · $20 USD/mes</div>
        </div>
        <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 4 }}>Volumen CTG hoy</div>
          <div style={{ fontFamily: F.serif, fontSize: isMobile ? 20 : 24, fontWeight: 400, color: T.gold }}>
            {metricsQ.isLoading ? '…' : `${metrics?.volumenCtgHoy ?? 0} CTG`}
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>
            {metrics ? `≈ ${formatCOP((metrics.volumenCtgHoy ?? 0) * 420)} COP` : ''}
          </div>
        </div>
        {!isMobile && <Btn variant="ghost" size="sm" onClick={() => setShowChat(true)}>💬 Chat cliente</Btn>}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiColumns, gap: 14, marginBottom: 24 }}>
        <Metric
          label="CITAS HOY"
          value={metricsQ.isLoading ? '…' : String(metrics?.citasHoy ?? 0)}
          accent={T.sage}
        />
        <Metric
          label="COMISIONES HOY"
          value={metricsQ.isLoading ? '…' : formatCOP(metrics?.comisionesHoy ?? 0)}
          sub="CTG + fiat"
          accent={T.gold}
        />
        <Metric
          label="VETS ACTIVOS"
          value={metricsQ.isLoading ? '…' : String(metrics?.veterinariosActivos ?? 0)}
          accent={T.goldLt}
        />
        <Metric
          label="TRANSF. PENDIENTES"
          value={transferQ.isLoading ? '…' : String(pendingTransfers)}
          sub={pendingTransfers > 0 ? 'Requieren verificación' : 'Sin pendientes'}
          accent={pendingTransfers > 0 ? T.warn : T.sageLt}
        />
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: mainColumns, gap: 16 }}>
        {/* Schedule */}
        <div style={cardStyle}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: T.ink }}>Citas recientes</div>
            {appointmentsQ.isFetching && (
              <span style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>Actualizando…</span>
            )}
          </div>
          <div style={{ padding: '8px 0' }}>
            {appointmentsQ.isLoading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} style={{ padding: '12px 22px', borderBottom: `1px solid ${T.line}`, opacity: 0.5 }}>
                  <div style={{ height: 14, background: T.surfaceAlt, borderRadius: 6, width: '60%' }} />
                </div>
              ))
            ) : appointmentsQ.isError ? (
              <div style={{ padding: '16px 22px', color: T.err, fontFamily: F.sans, fontSize: 13 }}>
                Error al cargar citas.
              </div>
            ) : apts.length === 0 ? (
              <div style={{ padding: '16px 22px', color: T.inkMuted, fontFamily: F.sans, fontSize: 13 }}>
                Sin citas recientes.
              </div>
            ) : (
              apts.slice(0, 6).map((apt, i) => {
                const dotColor =
                  apt.status === 'Completada' ? T.lineHi
                  : apt.status === 'Verificando' ? T.warn
                  : T.sage
                const badgeVariant =
                  apt.status === 'Completada' ? 'ok'
                  : apt.status === 'Verificando' ? 'warn'
                  : 'default'
                return (
                  <div
                    key={apt.id}
                    style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '10px 16px' : '12px 22px', borderBottom: i < apts.length - 1 ? `1px solid ${T.line}` : 'none' }}
                  >
                    <div style={{ fontFamily: F.mono, fontSize: 12, color: T.inkMuted, width: isMobile ? 'auto' : 56, flexShrink: 0 }}>{apt.id.slice(0, 6)}</div>
                    <div style={{ width: 2, height: isMobile ? 32 : 38, borderRadius: 1, background: dotColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: isMobile ? 12.5 : 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {apt.patient} · {apt.vet}
                      </div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>{apt.service} · {apt.date}</div>
                    </div>
                    {!isMobile && <PayBadge m={apt.paymentMethod} />}
                    <Badge variant={badgeVariant as any}>{apt.status}</Badge>
                  </div>
                )
              })
            )}
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
                    {apts.filter((a) => a.status !== 'Completada').length === 0
                      ? <option>Sin citas activas</option>
                      : apts.filter((a) => a.status !== 'Completada').map((a) => (
                        <option key={a.id} value={a.id}>{a.patient} ({a.service})</option>
                      ))
                    }
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
              ].map((pr, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 22px', borderBottom: i < 2 ? `1px solid ${T.line}` : 'none', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <span style={{ fontSize: 13.5, color: T.ink, flex: isMobile ? '1 1 100%' : 1, marginBottom: isMobile ? 8 : 0 }}>{pr.s}</span>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontFamily: F.mono, fontSize: 13, color: T.sage }}>${pr.p.toLocaleString('es-CO')}</span>
                    <span style={{ fontFamily: F.sans, fontSize: 12, color: T.gold }}>≈{Math.round(pr.p / 420)} CTG</span>
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
