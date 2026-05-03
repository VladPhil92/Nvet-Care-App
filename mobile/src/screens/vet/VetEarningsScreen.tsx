import React, { useMemo, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  SectionHeader,
  UI_COLORS,
} from '../../components/ui/primitives'
import EarningsBarChart, {
  BarData,
} from '../../components/earnings/EarningsBarChart'
import {
  useEarningsQuery,
  useTransactionsQuery,
} from '../../hooks/queries/useMobileQueries'
import {
  formatCOP,
  formatCOPCompact,
  formatRelativeTime,
} from '../../utils/format'

/**
 * VetEarningsScreen — pantalla de ingresos del veterinario.
 *
 * Capacidades:
 *  - KPIs: ingresos brutos / comisiones / neto / saldo disponible
 *  - Gráfico de barras de últimos 6 meses (derivado de transacciones CONFIRMED)
 *  - Lista de transferencias pendientes de verificación con CTA "Verificar"
 *  - Botón "Solicitar retiro" si hay saldo disponible
 *  - Pull-to-refresh
 *
 * Decisiones:
 *  - El gráfico se deriva en memoria de `useTransactionsQuery({ type: 'PAYMENT' })`.
 *    Cuando el backend exponga `/vets/me/earnings/by-month`, se conectará directo.
 *  - Las transferencias pendientes se filtran de `useTransactionsQuery({ status: 'VERIFYING' })`.
 *  - El KPI grid usa una sola query (`useEarningsQuery`) para totales.
 */

interface Props {
  navigation: any
}

const MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

function buildLast6MonthsBuckets(transactions: any[]): BarData[] {
  // Crear 6 buckets vacíos terminando en mes actual
  const now = new Date()
  const buckets: Array<{ year: number; month: number; total: number; label: string }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      total: 0,
      label: MONTHS[d.getMonth()],
    })
  }

  // Sumar transacciones a su bucket
  for (const tx of transactions) {
    if (tx.type !== 'PAYMENT') continue
    if (tx.status !== 'CONFIRMED' && tx.status !== 'LIQUIDATED') continue
    const created = new Date(tx.createdAt)
    const idx = buckets.findIndex(
      (b) => b.year === created.getFullYear() && b.month === created.getMonth(),
    )
    if (idx >= 0) {
      buckets[idx].total += tx.amountCop ?? 0
    }
  }

  return buckets.map((b) => ({
    label: b.label,
    value: b.total,
    period: `${b.year}-${String(b.month + 1).padStart(2, '0')}`,
  }))
}

export default function VetEarningsScreen({ navigation }: Props) {
  const earningsQuery = useEarningsQuery()
  const transactionsQuery = useTransactionsQuery({ type: 'PAYMENT' })
  const pendingQuery = useTransactionsQuery({ status: 'VERIFYING' })

  const earnings = earningsQuery.data
  const transactions = transactionsQuery.data ?? []
  const pendingTransfers = pendingQuery.data ?? []

  const chartData = useMemo(
    () => buildLast6MonthsBuckets(transactions),
    [transactions],
  )

  const handleRefresh = useCallback(() => {
    earningsQuery.refetch()
    transactionsQuery.refetch()
    pendingQuery.refetch()
  }, [earningsQuery, transactionsQuery, pendingQuery])

  const handleRequestWithdrawal = useCallback(() => {
    navigation.navigate('RequestWithdrawal')
  }, [navigation])

  const handleVerifyTransfer = useCallback(
    (transactionId: string) => {
      navigation.navigate('TransferVerification', { transactionId })
    },
    [navigation],
  )

  const isLoading = earningsQuery.isLoading
  const isRefetching =
    earningsQuery.isRefetching ||
    transactionsQuery.isRefetching ||
    pendingQuery.isRefetching

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={UI_COLORS.gold}
            colors={[UI_COLORS.gold]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Mis ingresos</Text>
          <Text style={styles.subtitle}>
            {earnings?.byTier?.tier
              ? `Plan ${earnings.byTier.tier} · Comisión ${earnings.byTier.commissionPct}%`
              : 'Tu actividad financiera'}
          </Text>
        </View>

        {/* Saldo disponible (hero) */}
        <Card variant="elevated" style={styles.heroCard}>
          <Text style={styles.heroLabel}>SALDO DISPONIBLE PARA RETIRO</Text>
          {isLoading ? (
            <Skeleton width="60%" height={32} />
          ) : (
            <Text style={styles.heroAmount}>
              {formatCOP(earnings?.availableBalance ?? 0)}
            </Text>
          )}
          {earnings?.pendingBalance ? (
            <Text style={styles.heroPending}>
              + {formatCOP(earnings.pendingBalance)} pendiente
            </Text>
          ) : null}
          <View style={{ marginTop: 12 }}>
            <Button
              label="Solicitar retiro"
              accent="gold"
              onPress={handleRequestWithdrawal}
              disabled={
                isLoading || (earnings?.availableBalance ?? 0) <= 0
              }
              fullWidth
            />
          </View>
        </Card>

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          <KpiCard
            label="Bruto"
            value={earnings?.totalEarnings}
            isLoading={isLoading}
            tone="text"
          />
          <KpiCard
            label="Comisiones"
            value={earnings?.totalCommissions}
            isLoading={isLoading}
            tone="muted"
            sign="-"
          />
          <KpiCard
            label="Neto"
            value={earnings?.netEarnings}
            isLoading={isLoading}
            tone="gold"
            highlight
          />
        </View>

        {/* Gráfico */}
        <SectionHeader
          title="Últimos 6 meses"
          subtitle="Ingresos confirmados por mes"
        />
        <Card>
          {transactionsQuery.isLoading ? (
            <Skeleton width="100%" height={180} />
          ) : (
            <EarningsBarChart data={chartData} />
          )}
        </Card>

        {/* Transferencias pendientes */}
        <SectionHeader
          title="Transferencias por verificar"
          subtitle={
            pendingTransfers.length > 0
              ? `${pendingTransfers.length} esperando tu acción`
              : 'Todo en orden'
          }
        />
        {pendingQuery.isLoading ? (
          <Skeleton width="100%" height={80} borderRadius={12} />
        ) : pendingTransfers.length === 0 ? (
          <Card variant="flat" style={styles.allDoneCard}>
            <Text style={styles.allDoneGlyph}>✓</Text>
            <Text style={styles.allDoneText}>
              No hay transferencias pendientes de verificación.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 8 }}>
            {pendingTransfers.map((tx: any) => (
              <PendingTransferCard
                key={tx.id}
                transaction={tx}
                onVerify={() => handleVerifyTransfer(tx.id)}
              />
            ))}
          </View>
        )}

        {/* Footer disclaimer */}
        <Text style={styles.footerNote}>
          Las liquidaciones se procesan en 24-48 h hábiles tras la confirmación
          del servicio. Las comisiones aplicadas dependen de tu plan actual.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

// =====================================================================
// KpiCard
// =====================================================================

interface KpiCardProps {
  label: string
  value?: number
  isLoading: boolean
  tone: 'text' | 'muted' | 'gold' | 'sage'
  sign?: string
  highlight?: boolean
}

function KpiCard({ label, value, isLoading, tone, sign, highlight }: KpiCardProps) {
  const colorMap = {
    text: UI_COLORS.text,
    muted: UI_COLORS.muted,
    gold: UI_COLORS.gold,
    sage: UI_COLORS.sage,
  }
  return (
    <View style={[styles.kpiCard, highlight && styles.kpiCardHighlight]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      {isLoading ? (
        <Skeleton width="80%" height={20} />
      ) : (
        <Text style={[styles.kpiValue, { color: colorMap[tone] }]}>
          {sign}
          {formatCOPCompact(value ?? 0)}
        </Text>
      )}
    </View>
  )
}

// =====================================================================
// PendingTransferCard
// =====================================================================

interface PendingTransferCardProps {
  transaction: any
  onVerify: () => void
}

function PendingTransferCard({ transaction, onVerify }: PendingTransferCardProps) {
  return (
    <Pressable
      onPress={onVerify}
      style={({ pressed }) => [
        styles.pendingCard,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Verificar transferencia de ${formatCOP(transaction.amountCop)}, ${formatRelativeTime(transaction.createdAt)}`}
      accessibilityHint="Toca para subir comprobante"
    >
      <View style={{ flex: 1 }}>
        <View style={styles.pendingTopRow}>
          <Badge label="Por verificar" tone="warning" size="sm" />
          <Text style={styles.pendingAmount}>
            {formatCOP(transaction.amountCop)}
          </Text>
        </View>
        <Text style={styles.pendingDescription} numberOfLines={1}>
          {transaction.description ?? 'Transferencia pendiente'}
        </Text>
        <Text style={styles.pendingMeta}>
          {formatRelativeTime(transaction.createdAt)} ·{' '}
          {transaction.paymentMethod}
        </Text>
      </View>
      <Text style={styles.pendingChevron}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: UI_COLORS.text },
  subtitle: { fontSize: 13, color: UI_COLORS.muted, marginTop: 4 },
  // Hero
  heroCard: {
    backgroundColor: '#1F2A1B',
    borderColor: 'transparent',
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroLabel: {
    fontSize: 10,
    color: UI_COLORS.muted,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: UI_COLORS.gold,
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  heroPending: {
    fontSize: 12,
    color: UI_COLORS.muted,
    marginTop: 4,
  },
  // KPIs
  kpiGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  kpiCard: {
    flex: 1,
    padding: 12,
    backgroundColor: UI_COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    minHeight: 70,
  },
  kpiCardHighlight: {
    borderColor: UI_COLORS.gold,
    backgroundColor: '#C9A9610a',
  },
  kpiLabel: {
    fontSize: 10,
    color: UI_COLORS.muted,
    letterSpacing: 0.6,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  // Pending transfer card
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: UI_COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.warning,
    borderLeftWidth: 4,
  },
  pendingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pendingAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: UI_COLORS.text,
  },
  pendingDescription: {
    fontSize: 13,
    color: UI_COLORS.text,
    fontWeight: '600',
  },
  pendingMeta: {
    fontSize: 11,
    color: UI_COLORS.muted,
    marginTop: 4,
  },
  pendingChevron: {
    fontSize: 28,
    color: UI_COLORS.muted,
    marginLeft: 12,
  },
  // All done
  allDoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  allDoneGlyph: {
    fontSize: 20,
    color: UI_COLORS.success,
    fontWeight: '700',
  },
  allDoneText: {
    fontSize: 13,
    color: UI_COLORS.muted,
    flex: 1,
  },
  footerNote: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontStyle: 'italic',
    marginTop: 24,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 16,
  },
})
