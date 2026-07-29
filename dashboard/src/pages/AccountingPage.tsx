import { useState } from 'react'
import { T, F, SPACING } from '../theme/tokens'
import { Metric, Badge, cardStyle, Btn } from '../components/UI'
import { PayBadge, TierBadge } from '../components/Badges'
import { useResponsive } from '../hooks/useResponsive'
import { CTGMark } from '../components/Logos'
import { useAdminTransactionsQuery } from '../hooks/queries/useAdminQueries'
import { useExportTransactionsMutation } from '../hooks/queries/useAdminMutations'

function SkeletonRow() {
  return (
    <div style={{ padding: '14px 22px', borderBottom: `1px solid ${T.line}`, opacity: 0.5 }}>
      <div style={{ height: 14, background: T.surfaceAlt, borderRadius: 6, width: '60%' }} />
    </div>
  )
}

export default function AccountingPage() {
  const [filter, setFilter] = useState('all')
  const [expandedTx, setExpandedTx] = useState<string | null>(null)
  const { isMobile, isTablet } = useResponsive()
  const containerPadding = isMobile
    ? `${SPACING.mobile.gutter}px`
    : isTablet
      ? `${SPACING.tablet.gutter}px`
      : `${SPACING.desktop.gutter}px`
  const kpiColumns = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'

  const statusFilter = ['LIQUIDADO', 'VERIFICANDO', 'DISPUTA', 'PENDING'].includes(filter)
    ? filter
    : undefined
  const methodFilter = ['CTG', 'PSE', 'TRANSFER'].includes(filter) ? filter : undefined

  const txQuery = useAdminTransactionsQuery({
    status: statusFilter,
    paymentMethod: methodFilter,
    limit: 50,
  } as any)
  const exportMutation = useExportTransactionsMutation()

  const txs = txQuery.data ?? []

  const totAmt = txs.reduce((a, t) => a + t.amount, 0)
  const totComm = txs.reduce((a, t) => a + t.commission, 0)
  const disputeCount = txs.filter((t) => t.status === 'DISPUTA').length

  const FILTERS = ['all', 'CTG', 'PSE', 'TRANSFER', 'LIQUIDADO', 'VERIFICANDO', 'DISPUTA']

  const handleExport = () => {
    exportMutation.mutate({ format: 'csv', status: statusFilter, paymentMethod: methodFilter })
  }

  return (
    <div style={{ padding: containerPadding }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiColumns, gap: 14, marginBottom: 24 }}>
        <Metric
          label="FACTURADO"
          value={txQuery.isLoading ? '…' : `$${(totAmt / 1000).toFixed(0)}K`}
          sub={txQuery.isLoading ? undefined : `${txs.length} transacciones`}
          accent={T.sage}
        />
        <Metric
          label="COMISIONES"
          value={txQuery.isLoading ? '…' : `$${(totComm / 1000).toFixed(1)}K`}
          sub="COP este período"
          accent={T.gold}
        />
        <Metric
          label="CTG COBRADO"
          value={txQuery.isLoading ? '…' : `${(totComm / 420).toFixed(0)} CTG`}
          sub="Debitado de vets"
          accent={T.goldLt}
        />
        <Metric
          label="EN DISPUTA"
          value={txQuery.isLoading ? '…' : String(disputeCount)}
          sub={disputeCount > 0 ? 'Requieren revisión' : 'Sin disputas'}
          accent={disputeCount > 0 ? T.err : T.sageLt}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Btn key={f} size="sm" variant={filter === f ? 'dark' : 'ghost'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todos' : f}
          </Btn>
        ))}
        {!isMobile && (
          <div style={{ marginLeft: 'auto' }}>
            <Btn
              size="sm"
              variant="ghost"
              onClick={handleExport}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? 'Exportando…' : '⬇ Exportar CSV'}
            </Btn>
          </div>
        )}
      </div>

      {/* Ledger */}
      <div style={cardStyle}>
        {!isMobile && (
          <div
            style={{
              padding: '14px 22px',
              borderBottom: `1px solid ${T.line}`,
              display: 'flex',
              gap: 0,
            }}
          >
            {(isTablet
              ? ['ID', 'Fecha', 'Vet/Cliente', 'Monto', 'Estado']
              : ['ID', 'Fecha', 'Veterinario / Cliente', 'Método', 'Monto', 'Comisión', 'Estado']
            ).map((h) => (
              <div
                key={h}
                style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.inkMuted,
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase',
                  flex:
                    h.includes('Veterinario') || h.includes('Vet/Cliente') ? 2 : 1,
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}

        {txQuery.isLoading ? (
          [1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)
        ) : txQuery.isError ? (
          <div style={{ padding: '24px 22px', color: T.err, fontFamily: F.sans, fontSize: 13 }}>
            Error al cargar transacciones. Intenta de nuevo.
          </div>
        ) : txs.length === 0 ? (
          <div style={{ padding: '24px 22px', color: T.inkMuted, fontFamily: F.sans, fontSize: 13 }}>
            No hay transacciones para el filtro seleccionado.
          </div>
        ) : (
          txs.map((tx, _i) => {
            const open = expandedTx === tx.id
            return (
              <div key={tx.id}>
                {isMobile ? (
                  <div
                    style={{
                      padding: '14px 20px',
                      borderBottom: `1px solid ${T.line}`,
                      cursor: 'pointer',
                      background: open ? T.surfaceAlt : 'transparent',
                      transition: 'background .15s',
                    }}
                    onClick={() => setExpandedTx(open ? null : tx.id)}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <span style={{ fontFamily: F.mono, fontSize: 12, color: T.inkMuted }}>
                        {tx.id}
                      </span>
                      <Badge
                        variant={
                          tx.status === 'LIQUIDADO'
                            ? 'ok'
                            : tx.status === 'VERIFICANDO'
                              ? 'warn'
                              : tx.status === 'DISPUTA'
                                ? 'err'
                                : 'default'
                        }
                      >
                        {tx.status}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{tx.vet}</div>
                    <div
                      style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        color: T.inkMuted,
                        marginBottom: 8,
                      }}
                    >
                      {tx.client} · {tx.service} · {tx.date}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <PayBadge m={tx.paymentMethod} />
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 500 }}>
                          ${tx.amount.toLocaleString('es-CO')}
                        </div>
                        <div style={{ color: T.err, fontFamily: F.mono, fontSize: 11 }}>
                          –${tx.commission.toLocaleString('es-CO')}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0,
                      padding: '14px 22px',
                      borderBottom: `1px solid ${T.line}`,
                      cursor: 'pointer',
                      background: open ? T.surfaceAlt : 'transparent',
                      transition: 'background .15s',
                    }}
                    onClick={() => setExpandedTx(open ? null : tx.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: F.mono, fontSize: 12 }}>{tx.id}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12.5, color: T.inkSec, fontFamily: F.mono }}>
                        {tx.date}
                      </span>
                    </div>
                    <div style={{ flex: 2 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{tx.vet}</div>
                      <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>
                        {tx.client} · {tx.service}
                      </div>
                    </div>
                    {!isTablet && (
                      <div style={{ flex: 1 }}>
                        <PayBadge m={tx.paymentMethod} />
                      </div>
                    )}
                    <div style={{ flex: 1, fontFamily: F.mono, fontSize: 13.5, fontWeight: 500 }}>
                      ${tx.amount.toLocaleString('es-CO')}
                    </div>
                    {!isTablet && (
                      <div style={{ flex: 1, color: T.err, fontFamily: F.mono, fontSize: 13 }}>
                        –${tx.commission.toLocaleString('es-CO')}
                      </div>
                    )}
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Badge
                        variant={
                          tx.status === 'LIQUIDADO'
                            ? 'ok'
                            : tx.status === 'VERIFICANDO'
                              ? 'warn'
                              : tx.status === 'DISPUTA'
                                ? 'err'
                                : 'default'
                        }
                      >
                        {tx.status}
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
                  </div>
                )}

                {/* Expanded detail */}
                {open && (
                  <div
                    style={{
                      padding: isMobile ? '14px 20px' : '16px 22px 20px',
                      background: T.surfaceAlt,
                      borderBottom: `1px solid ${T.line}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
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
                          }}
                        >
                          TIER
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <TierBadge t={tx.tier} />
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 600,
                            color: T.inkMuted,
                            letterSpacing: '1.2px',
                            textTransform: 'uppercase',
                          }}
                        >
                          COMISIÓN
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontFamily: F.mono,
                            fontSize: 14,
                            color: T.err,
                          }}
                        >
                          {tx.commissionPct}% · ${tx.commission.toLocaleString('es-CO')}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 600,
                            color: T.inkMuted,
                            letterSpacing: '1.2px',
                            textTransform: 'uppercase',
                          }}
                        >
                          TX HASH
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontFamily: F.mono,
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {tx.hash ? (
                            <>
                              <CTGMark size={14} />
                              <span>{tx.hash.slice(0, 10)}…</span>
                            </>
                          ) : (
                            <span style={{ color: T.inkMuted }}>Pendiente</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 600,
                            color: T.inkMuted,
                            letterSpacing: '1.2px',
                            textTransform: 'uppercase',
                          }}
                        >
                          FECHA
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontFamily: F.mono,
                            fontSize: 13,
                            color: T.ink,
                          }}
                        >
                          {tx.date}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
