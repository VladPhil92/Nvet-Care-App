import React, { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  UI_COLORS,
} from '../../components/ui/primitives'
import {
  useBalanceQuery,
  useInfiniteTransactionsQuery,
  useCtgRateQuery,
} from '../../hooks/queries/useMobileQueries'
import {
  formatCOP,
  formatCTG,
  formatRelativeTime,
} from '../../utils/format'
import { PaymentFlowStepper } from '../../components/payments/PaymentFlowStepper'
import { PaymentMethodsCard } from '../../components/payments/PaymentMethodsCard'

/**
 * WalletScreen — billetera digital del usuario.
 *
 * Capacidades:
 *  - Hero card con saldo CTG + equivalencia COP + saldo pendiente
 *  - Filtros chip (Todas / Pagos / Comisiones / Depósitos / Retiros)
 *  - Lista paginada con `useInfiniteTransactionsQuery` + scroll infinito
 *  - Pull-to-refresh
 *  - Bullet de estado por transacción (CONFIRMED / PENDING / FAILED)
 *  - Botones de Recargar y Retirar (placeholder)
 *
 * Reusable para cliente y vet (la diferencia es solo el filtro inicial).
 */

interface Props {
  navigation: any
}

type FilterId = 'ALL' | 'PAYMENT' | 'COMMISSION' | 'DEPOSIT' | 'WITHDRAWAL'

interface FilterOption {
  id: FilterId
  label: string
  glyph: string
}

const FILTERS: FilterOption[] = [
  { id: 'ALL', label: 'Todas', glyph: '◷' },
  { id: 'PAYMENT', label: 'Pagos', glyph: '↑' },
  { id: 'COMMISSION', label: 'Comisiones', glyph: '%' },
  { id: 'DEPOSIT', label: 'Depósitos', glyph: '↓' },
  { id: 'WITHDRAWAL', label: 'Retiros', glyph: '↗' },
]

const STATUS_TONES: Record<string, 'sage' | 'success' | 'warning' | 'error' | 'info' | 'muted'> = {
  PENDING: 'warning',
  VERIFYING: 'info',
  CONFIRMED: 'sage',
  LIQUIDATED: 'success',
  DISPUTED: 'error',
  FAILED: 'error',
}

export default function WalletScreen({ navigation }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterId>('ALL')

  const balanceQuery = useBalanceQuery()
  const ctgRateQuery = useCtgRateQuery()

  const txQuery = useInfiniteTransactionsQuery(
    activeFilter === 'ALL' ? {} : { type: activeFilter },
  )

  const transactions = useMemo(() => {
    if (!txQuery.data?.pages) return []
    return txQuery.data.pages.flatMap((page: any) =>
      Array.isArray(page) ? page : page?.items ?? [],
    )
  }, [txQuery.data])

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      balanceQuery.refetch(),
      ctgRateQuery.refetch(),
      txQuery.refetch(),
    ])
  }, [balanceQuery, ctgRateQuery, txQuery])

  const handleEndReached = useCallback(() => {
    if (txQuery.hasNextPage && !txQuery.isFetchingNextPage) {
      txQuery.fetchNextPage()
    }
  }, [txQuery])

  const balance = balanceQuery.data
  const ctgRate = ctgRateQuery.data?.rate ?? 0
  const ctgInCop = (balance?.ctgBalance ?? 0) * ctgRate

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Mi billetera</Text>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionRow transaction={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            {/* Hero balance card */}
            <Card variant="elevated" style={styles.heroCard}>
              <Text style={styles.heroLabel}>SALDO DISPONIBLE</Text>
              {balanceQuery.isLoading ? (
                <Skeleton width="60%" height={32} />
              ) : (
                <Text style={styles.heroAmount}>
                  {formatCTG(balance?.ctgBalance ?? 0)}
                </Text>
              )}
              {ctgRate > 0 && (
                <Text style={styles.heroEquivalent}>
                  ≈ {formatCOP(ctgInCop)}
                </Text>
              )}

              {/* Saldo pendiente */}
              {balance?.pendingCtg ? (
                <View style={styles.pendingRow}>
                  <Text style={styles.pendingLabel}>Pendiente:</Text>
                  <Text style={styles.pendingValue}>
                    {formatCTG(balance.pendingCtg)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.heroActions}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Recargar"
                    accent="gold"
                    leadingIcon="+"
                    onPress={() => navigation.navigate('TopUpWallet')}
                    fullWidth
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Retirar"
                    variant="secondary"
                    accent="gold"
                    leadingIcon="↗"
                    onPress={() => navigation.navigate('RequestWithdrawal')}
                    disabled={(balance?.copBalance ?? 0) <= 0}
                    fullWidth
                  />
                </View>
              </View>
            </Card>

            {/* Asi funciona tu pago en Nvet Care (mockup oficial) */}
            <View style={styles.flowSection}>
              <Text style={styles.flowTitle}>Así funciona tu pago en Nvet Care</Text>
              <Text style={styles.flowSubtitle}>
                Todas las transacciones están protegidas para que tú y tu mascota estén siempre seguros.
              </Text>
              <View style={{ marginTop: 12 }}>
                <PaymentFlowStepper currentStep="released" compact />
              </View>
              <View style={styles.flowGuarantee}>
                <Text style={styles.flowGuaranteeText}>
                  🛡️ Tu pago solo se libera cuando tú confirmas que el servicio fue completado.
                </Text>
              </View>
            </View>

            {/* Filtros */}
            <View style={styles.filterRow}>
              {FILTERS.map((f) => {
                const isActive = activeFilter === f.id
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setActiveFilter(f.id)}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={f.label}
                  >
                    <Text style={[styles.filterGlyph, isActive && styles.filterTextActive]}>
                      {f.glyph}
                    </Text>
                    <Text
                      style={[
                        styles.filterLabel,
                        isActive && styles.filterTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={styles.sectionTitle}>Movimientos</Text>
          </>
        }
        ListEmptyComponent={
          txQuery.isLoading ? (
            <View style={{ gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} width="100%" height={64} borderRadius={12} />
              ))}
            </View>
          ) : (
            <EmptyState
              glyph="📭"
              title="Sin movimientos"
              subtitle="Tus transacciones aparecerán aquí cuando hagas pagos o recibas pagos."
            />
          )
        }
        ListFooterComponent={
          <>
            {txQuery.isFetchingNextPage ? (
              <View style={styles.loadMore}>
                <ActivityIndicator size="small" color={UI_COLORS.sage} />
                <Text style={styles.loadMoreText}>Cargando más…</Text>
              </View>
            ) : transactions.length > 0 && !txQuery.hasNextPage ? (
              <Text style={styles.endText}>— Fin del historial —</Text>
            ) : null}

            {/* Métodos de pago aceptados + protección al usuario (mockup oficial) */}
            <View style={styles.methodsWrap}>
              <PaymentMethodsCard showProtection />
            </View>
          </>
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={
              balanceQuery.isRefetching || txQuery.isRefetching
            }
            onRefresh={handleRefresh}
            tintColor={UI_COLORS.sage}
            colors={[UI_COLORS.sage]}
          />
        }
      />
    </SafeAreaView>
  )
}

// =====================================================================
// TransactionRow
// =====================================================================

function TransactionRow({ transaction }: { transaction: any }) {
  const isCredit = transaction.type === 'DEPOSIT' || transaction.type === 'PAYMENT'
  const sign = isCredit ? '+' : '−'
  const tone = STATUS_TONES[transaction.status] ?? 'muted'

  const typeLabels: Record<string, string> = {
    PAYMENT: 'Pago recibido',
    COMMISSION: 'Comisión',
    DEPOSIT: 'Recarga',
    WITHDRAWAL: 'Retiro',
  }
  const statusLabels: Record<string, string> = {
    PENDING: 'Pendiente',
    VERIFYING: 'Verificando',
    CONFIRMED: 'Confirmado',
    LIQUIDATED: 'Liquidado',
    DISPUTED: 'En disputa',
    FAILED: 'Fallido',
  }

  return (
    <View style={styles.txRow}>
      {/* Bullet */}
      <View style={[styles.txBullet, { backgroundColor: getStatusColor(transaction.status) }]} />

      <View style={{ flex: 1 }}>
        <View style={styles.txTopRow}>
          <Text style={styles.txType}>
            {typeLabels[transaction.type] ?? transaction.type}
          </Text>
          <Text
            style={[
              styles.txAmount,
              { color: isCredit ? UI_COLORS.success : UI_COLORS.text },
            ]}
          >
            {sign} {formatCOP(transaction.amountCop)}
          </Text>
        </View>
        <View style={styles.txBottomRow}>
          <Badge label={statusLabels[transaction.status] ?? transaction.status} tone={tone} size="sm" />
          <Text style={styles.txDate}>
            {formatRelativeTime(transaction.createdAt)} ·{' '}
            {transaction.paymentMethod}
          </Text>
        </View>
      </View>
    </View>
  )
}

function getStatusColor(status: string): string {
  return (
    {
      PENDING: UI_COLORS.warning,
      VERIFYING: UI_COLORS.info,
      CONFIRMED: UI_COLORS.sage,
      LIQUIDATED: UI_COLORS.success,
      DISPUTED: UI_COLORS.error,
      FAILED: UI_COLORS.error,
    } as Record<string, string>
  )[status] ?? UI_COLORS.muted
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    gap: 8,
  },
  back: { fontSize: 28, color: UI_COLORS.sage },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  content: { padding: 16 },
  // Hero
  heroCard: {
    backgroundColor: '#1F2A1B',
    borderColor: 'transparent',
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 20,
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
  heroEquivalent: {
    fontSize: 13,
    color: UI_COLORS.muted,
    marginTop: 4,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#FFFFFF12',
  },
  pendingLabel: { fontSize: 11, color: UI_COLORS.muted, fontWeight: '600' },
  pendingValue: { fontSize: 12, color: UI_COLORS.gold, fontWeight: '700' },
  heroActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    width: '100%',
  },
  // Filtros
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: UI_COLORS.card,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  filterChipActive: {
    backgroundColor: UI_COLORS.sage,
    borderColor: UI_COLORS.sage,
  },
  filterGlyph: { fontSize: 13, color: UI_COLORS.muted, fontWeight: '700' },
  filterLabel: { fontSize: 12, color: UI_COLORS.text, fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 8,
  },
  // Tx row
  txRow: {
    flexDirection: 'row',
    backgroundColor: UI_COLORS.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    gap: 12,
    alignItems: 'center',
  },
  txBullet: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  txType: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text, flex: 1 },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  txBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  txDate: { fontSize: 11, color: UI_COLORS.muted },
  // Footer
  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  loadMoreText: { fontSize: 12, color: UI_COLORS.muted },
  endText: {
    textAlign: 'center',
    fontSize: 11,
    color: UI_COLORS.muted,
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  // "Así funciona tu pago" (mockup oficial)
  flowSection: {
    backgroundColor: UI_COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    marginBottom: 20,
  },
  flowTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: UI_COLORS.text,
    marginBottom: 4,
  },
  flowSubtitle: {
    fontSize: 12,
    color: UI_COLORS.muted,
    lineHeight: 16,
  },
  flowGuarantee: {
    backgroundColor: '#5B75530a',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  flowGuaranteeText: {
    fontSize: 12,
    color: UI_COLORS.text,
    fontWeight: '500',
    lineHeight: 16,
  },
  // Métodos de pago
  methodsWrap: {
    marginTop: 24,
    paddingVertical: 8,
  },
})
