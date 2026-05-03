import { useState } from 'react'
import { T, F, SPACING } from '../theme/tokens'
import { Metric, Badge, cardStyle, Btn } from '../components/UI'
import { PayBadge, TierBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'
import { CTGMark } from '../components/Logos'

export default function AccountingPage() {
  const [filter, setFilter] = useState('all')
  const [expandedTx, setExpandedTx] = useState<string | null>(null)
  const { isMobile, isTablet } = useResponsive()
  const containerPadding = isMobile ? `${SPACING.mobile.gutter}px` : isTablet ? `${SPACING.tablet.gutter}px` : `${SPACING.desktop.gutter}px`
  const kpiColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'

  const txs = [
    { id: 'TX0047', date: '22 Feb · 14:12', vet: 'Dra. Ospina', tier: 'elite' as const, client: 'Laura G.', svc: 'Consulta', amount: 85000, pay: 'CTG', comm: 2550, pct: 3, hash: '0xA3F2…B91C', st: 'LIQUIDADO' },
    { id: 'TX0048', date: '22 Feb · 10:15', vet: 'Dr. Mora', tier: 'pro' as const, client: 'Carlos R.', svc: 'Vacunación', amount: 65000, pay: 'TRANSFER', comm: 5200, pct: 8, hash: '—', st: 'VERIFICANDO' },
    { id: 'TX0049', date: '22 Feb · 09:30', vet: 'Dra. Ríos', tier: 'free' as const, client: 'Sofía H.', svc: 'Revisión', amount: 75000, pay: 'PSE', comm: 7500, pct: 10, hash: '—', st: 'LIQUIDADO' },
    { id: 'TX0050', date: '21 Feb · 16:00', vet: 'Dr. Castro', tier: 'pro' as const, client: 'Miguel T.', svc: 'Consulta', amount: 85000, pay: 'CTG', comm: 6800, pct: 8, hash: '0xC7D1…44E2', st: 'LIQUIDADO' },
    { id: 'TX0051', date: '21 Feb · 11:30', vet: 'Dra. López', tier: 'free' as const, client: 'Ana M.', svc: 'Deworm', amount: 45000, pay: 'PSE', comm: 4500, pct: 10, hash: '—', st: 'DISPUTA' },
    { id: 'TX0052', date: '20 Feb · 15:45', vet: 'Dra. Ospina', tier: 'elite' as const, client: 'Juan P.', svc: 'Urgencia', amount: 150000, pay: 'CTG', comm: 4500, pct: 3, hash: '0xE8C4…921A', st: 'LIQUIDADO' },
  ]

  const FILTERS = ['all', 'CTG', 'PSE', 'TRANSFER', 'LIQUIDADO', 'VERIFICANDO', 'DISPUTA']
  const shown = filter === 'all' ? txs : txs.filter(t => t.pay === filter || t.st === filter)
  const totAmt = shown.reduce((a, t) => a + t.amount, 0)
  const totComm = shown.reduce((a, t) => a + t.comm, 0)

  return (
    <div style={{ padding: containerPadding }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiColumns, gap: 14, marginBottom: 24 }}>
        <Metric label="FACTURADO" value={`$${(totAmt / 1000).toFixed(0)}K`} sub={`${shown.length} transacciones`} accent={T.sage} />
        <Metric label="COMISIONES" value={`$${(totComm / 1000).toFixed(1)}K`} sub="COP este período" accent={T.gold} />
        <Metric label="CTG COBRADO" value={`${(totComm / 420).toFixed(0)} CTG`} sub="Debitado de vets" accent={T.goldLt} />
        <Metric label="EN DISPUTA" value="1" sub="TX0051 — revisar" accent={T.err} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <Btn key={f} size="sm" variant={filter === f ? 'dark' : 'ghost'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todos' : f}
          </Btn>
        ))}
        {!isMobile && (
          <div style={{ marginLeft: 'auto' }}>
            <Btn size="sm" variant="ghost">⬇ Exportar CSV</Btn>
          </div>
        )}
      </div>

      {/* Ledger */}
      <div style={cardStyle}>
        {/* Desktop/Tablet: Table header */}
        {!isMobile && (
          <div style={{ padding: '14px 22px', borderBottom: `1px solid ${T.line}`, display: 'flex', gap: 0 }}>
            {(isTablet ? ['ID', 'Fecha', 'Vet/Cliente', 'Monto', 'Estado'] : ['ID', 'Fecha', 'Veterinario / Cliente', 'Método', 'Monto', 'Comisión', 'Estado']).map(h => (
              <div
                key={h}
                style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.inkMuted,
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase',
                  flex: h.includes('Veterinario') || h.includes('Vet/Cliente') ? 2 : 1
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}
        {shown.map((tx, i) => {
          const open = expandedTx === tx.id
          return (
            <div key={tx.id}>
              {/* Summary row */}
              {isMobile ? (
                // Mobile: Card view
                <div
                  style={{
                    padding: '14px 20px',
                    borderBottom: `1px solid ${T.line}`,
                    cursor: 'pointer',
                    background: open ? T.surfaceAlt : 'transparent',
                    transition: 'background .15s'
                  }}
                  onClick={() => setExpandedTx(open ? null : tx.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 12, color: T.inkMuted }}>{tx.id}</span>
                    <Badge variant={tx.st === 'LIQUIDADO' ? 'ok' : tx.st === 'VERIFICANDO' ? 'warn' : 'err'}>{tx.st}</Badge>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{tx.vet}</div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted, marginBottom: 8 }}>
                    {tx.client} · {tx.svc} · {tx.date}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <PayBadge m={tx.pay} />
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 500 }}>${tx.amount.toLocaleString('es-CO')}</div>
                      <div style={{ color: T.err, fontFamily: F.mono, fontSize: 11 }}>–${tx.comm.toLocaleString('es-CO')}</div>
                    </div>
                  </div>
                </div>
              ) : (
                // Desktop/Tablet: Table row
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0,
                    padding: '14px 22px',
                    borderBottom: `1px solid ${T.line}`,
                    cursor: 'pointer',
                    background: open ? T.surfaceAlt : 'transparent',
                    transition: 'background .15s'
                  }}
                  onClick={() => setExpandedTx(open ? null : tx.id)}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 12 }}>{tx.id}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12.5, color: T.inkSec, fontFamily: F.mono }}>{tx.date}</span>
                  </div>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{tx.vet}</div>
                    <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>
                      {tx.client} · <span style={{ fontFamily: F.mono, fontSize: 11 }}>{tx.svc}</span>
                    </div>
                  </div>
                  {!isTablet && <div style={{ flex: 1 }}><PayBadge m={tx.pay} /></div>}
                  <div style={{ flex: 1, fontFamily: F.mono, fontSize: 13.5, fontWeight: 500 }}>${tx.amount.toLocaleString('es-CO')}</div>
                  {!isTablet && <div style={{ flex: 1, color: T.err, fontFamily: F.mono, fontSize: 13 }}>–${tx.comm.toLocaleString('es-CO')}</div>}
                  <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge variant={tx.st === 'LIQUIDADO' ? 'ok' : tx.st === 'VERIFICANDO' ? 'warn' : 'err'}>{tx.st}</Badge>
                    <span style={{ color: T.inkMuted, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
                  </div>
                </div>
              )}

              {/* Accordion detail */}
              {open && (
                <div style={{ padding: isMobile ? '14px 20px' : '16px 22px 20px 22px', background: T.surfaceAlt, borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 16 }}>
                    <div>
                      <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase' }}>TIER</div>
                      <div style={{ marginTop: 6 }}><TierBadge t={tx.tier} /></div>
                    </div>
                    <div>
                      <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase' }}>% COMISIÓN</div>
                      <div style={{ fontFamily: F.serif, fontSize: 22, color: T.err, marginTop: 4 }}>{tx.pct}%</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase' }}>NETO VETERINARIO</div>
                      <div style={{ fontFamily: F.serif, fontSize: 22, color: T.sage, marginTop: 4 }}>${(tx.amount - tx.comm).toLocaleString('es-CO')}</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase' }}>CTG DESCONTADO</div>
                      <div style={{ fontFamily: F.serif, fontSize: 22, color: T.gold, marginTop: 4 }}>{(tx.comm / 420).toFixed(2)}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>CTG Token</div>
                    </div>
                  </div>
                  {tx.hash !== '—' && (
                    <div style={{ marginTop: 16, padding: '10px 14px', background: `${T.gold}08`, borderRadius: 8, border: `1px solid ${T.gold}30`, display: 'flex', gap: 10, alignItems: 'center' }}>
                      <CTGMark size={20} />
                      <div>
                        <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.gold, letterSpacing: '1.2px', textTransform: 'uppercase' }}>HASH ON-CHAIN · POLYGON</div>
                        <div style={{ fontFamily: F.mono, fontSize: 12, color: T.inkSec, marginTop: 2 }}>{tx.hash}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {/* Footer totals */}
        <div style={{ padding: isMobile ? '14px 20px' : '16px 22px', display: 'flex', justifyContent: isMobile ? 'space-between' : 'flex-end', gap: isMobile ? 16 : 40, flexWrap: 'wrap' }}>
          {[
            ['Total facturado', '$' + totAmt.toLocaleString('es-CO'), T.ink],
            ['Comisiones Nvet', '$' + totComm.toLocaleString('es-CO'), T.err],
            ['CTG cobrado', (totComm / 420).toFixed(2) + ' CTG', T.gold]
          ].map(([k, v, c]) => (
            <div key={k as string} style={{ textAlign: isMobile ? 'left' : 'right' }}>
              <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '1.2px', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontFamily: F.serif, fontSize: isMobile ? 18 : 20, fontWeight: 400, color: c as string, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
