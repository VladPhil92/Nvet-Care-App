import React, { useMemo, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Badge,
  Skeleton,
  EmptyState,
  SectionHeader,
  UI_COLORS,
} from '../../components/ui/primitives'
import {
  useCurrentUserQuery,
  useTodayAppointmentsQuery,
  useEarningsQuery,
  useBalanceQuery,
} from '../../hooks/queries/useMobileQueries'
import {
  formatCOP,
  formatCOPCompact,
  formatCTG,
} from '../../utils/format'

/**
 * VetDashboardScreen — panel principal del veterinario.
 *
 * Refactorizado para consumir React Query (eliminada mock data).
 *
 * Layout:
 *  - Greeting hora-based + tier badge
 *  - Hero card oscuro con saldo CTG (comisiones liquidadas)
 *  - Grid de 4 KPIs (citas hoy / ingresos hoy / rating / pendientes)
 *  - Lista de citas de hoy con status colors
 *  - Quick actions grid
 */

interface Props {
  navigation: any
}

const STATUS_TONES: Record<
  string,
  'sage' | 'gold' | 'success' | 'warning' | 'error' | 'info' | 'muted'
> = {
  PENDING: 'warning',
  CONFIRMED: 'sage',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'muted',
  DISPUTED: 'error',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Por confirmar',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  DISPUTED: 'En disputa',
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function VetDashboardScreen({ navigation }: Props) {
  const userQuery = useCurrentUserQuery()
  const todayQuery = useTodayAppointmentsQuery()
  const earningsQuery = useEarningsQuery()
  const balanceQuery = useBalanceQuery()

  const user = userQuery.data
  const todayAppointments = todayQuery.data ?? []
  const balance = balanceQuery.data

  const todayKpis = useMemo(() => {
    const active = todayAppointments.filter((a) => a.status !== 'CANCELLED')
    const todayRevenue = active.reduce((sum, a) => sum + (a.amount ?? 0), 0)
    const pendingPayments = active.filter(
      (a) => (a as any).paymentStatus === 'VERIFYING' || a.status === 'PENDING',
    ).length

    return {
      count: active.length,
      revenue: todayRevenue,
      pending: pendingPayments,
    }
  }, [todayAppointments])

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      userQuery.refetch(),
      todayQuery.refetch(),
      earningsQuery.refetch(),
      balanceQuery.refetch(),
    ])
  }, [userQuery, todayQuery, earningsQuery, balanceQuery])

  const handleAppointmentPress = useCallback(
    (id: string) => {
      navigation.navigate('VetAppointmentDetail', { appointmentId: id })
    },
    [navigation],
  )

  const tier = user?.vetProfile?.tier ?? 'FREE'
  const tierTone: 'sage' | 'gold' | 'muted' =
    tier === 'ELITE' ? 'gold' : tier === 'PRO' ? 'sage' : 'muted'

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={
              todayQuery.isRefetching ||
              earningsQuery.isRefetching ||
              balanceQuery.isRefetching
            }
            onRefresh={handleRefresh}
            tintColor={UI_COLORS.gold}
            colors={[UI_COLORS.gold]}
          />
        }
      >
        {/* Greeting */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            {userQuery.isLoading ? (
              <Skeleton width="60%" height={28} />
            ) : (
              <Text style={styles.greeting}>
                {getGreeting()},{' '}
                <Text style={styles.greetingName}>
                  Dr. {user?.firstName ?? ''}
                </Text>
              </Text>
            )}
            <Text style={styles.greetingSubtitle}>Panel veterinario</Text>
          </View>
          <Badge label={tier} tone={tierTone} outline />
        </View>

        {/* Saldo hero */}
        <Card variant="elevated" style={styles.heroCard}>
          <Text style={styles.heroLabel}>SALDO CTG (COMISIONES)</Text>
          {balanceQuery.isLoading ? (
            <Skeleton width="60%" height={32} />
          ) : (
            <Text style={styles.heroAmount}>
              {formatCTG(balance?.ctgBalance ?? 0)}
            </Text>
          )}
          {balance?.copBalance ? (
            <Text style={styles.heroEquivalent}>
              ≈ {formatCOP(balance.copBalance)} disponibles para retiro
            </Text>
          ) : null}
        </Card>

        {/* KPIs */}
        <View style={styles.kpiGrid}>
          <KpiCard
            label="Citas hoy"
            value={String(todayKpis.count)}
            tone="text"
            isLoading={todayQuery.isLoading}
          />
          <KpiCard
            label="Ingresos hoy"
            value={formatCOPCompact(todayKpis.revenue)}
            tone="gold"
            isLoading={todayQuery.isLoading}
          />
          <KpiCard
            label="Calificación"
            value={
              user?.vetProfile?.rating
                ? `${user.vetProfile.rating.toFixed(1)} ★`
                : '—'
            }
            tone="goldLight"
            isLoading={userQuery.isLoading}
          />
          <KpiCard
            label="Por verificar"
            value={String(todayKpis.pending)}
            tone={todayKpis.pending > 0 ? 'warning' : 'text'}
            isLoading={todayQuery.isLoading}
          />
        </View>

        {/* Agenda de hoy */}
        <SectionHeader
          title="Agenda de hoy"
          subtitle={
            todayAppointments.length === 0
              ? 'Día libre'
              : `${todayKpis.count} citas programadas`
          }
          actionLabel="Ver agenda completa"
          onActionPress={() => navigation.navigate('VetSchedule')}
        />

        {todayQuery.isLoading ? (
          <View style={{ gap: 8 }}>
            {[0, 1].map((i) => (
              <Skeleton key={i} width="100%" height={70} borderRadius={12} />
            ))}
          </View>
        ) : todayAppointments.length === 0 ? (
          <EmptyState
            glyph="📅"
            title="Sin citas hoy"
            subtitle="Disfruta tu día libre o aprovecha para actualizar tu agenda."
          />
        ) : (
          <View style={{ gap: 8 }}>
            {todayAppointments
              .sort((a, b) => (a.time > b.time ? 1 : -1))
              .map((apt) => (
                <Pressable
                  key={apt.id}
                  onPress={() => handleAppointmentPress(apt.id)}
                  style={({ pressed }) => [
                    styles.aptCard,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Cita ${apt.time}: ${apt.serviceType} con ${apt.client?.firstName}`}
                >
                  <View
                    style={[
                      styles.aptStatusLine,
                      { backgroundColor: getStatusColor(apt.status) },
                    ]}
                  />
                  <View style={styles.aptTimeBlock}>
                    <Text style={styles.aptTime}>{apt.time}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aptService}>{apt.serviceType}</Text>
                    <Text style={styles.aptClient}>
                      {apt.pet?.name ? `🐾 ${apt.pet.name} · ` : ''}
                      {apt.client?.firstName} {apt.client?.lastName}
                    </Text>
                    <View style={styles.aptBottomRow}>
                      <Badge
                        label={STATUS_LABELS[apt.status] ?? apt.status}
                        tone={STATUS_TONES[apt.status] ?? 'muted'}
                        size="sm"
                      />
                      <Badge label={apt.paymentMethod} tone="muted" size="sm" outline />
                    </View>
                  </View>
                </Pressable>
              ))}
          </View>
        )}

        {/* Quick actions */}
        <SectionHeader title="Acciones rápidas" />
        <View style={styles.actionsGrid}>
          <ActionTile
            glyph="📋"
            label="Mis servicios"
            onPress={() => navigation.navigate('PriceManagement')}
          />
          <ActionTile
            glyph="💰"
            label="Ingresos"
            onPress={() => navigation.navigate('VetEarnings')}
          />
          <ActionTile
            glyph="📅"
            label="Agenda"
            onPress={() => navigation.navigate('VetSchedule')}
          />
          <ActionTile
            glyph="💬"
            label="Chats activos"
            onPress={() => navigation.navigate('Chats')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function getStatusColor(status: string): string {
  return (
    {
      PENDING: UI_COLORS.warning,
      CONFIRMED: UI_COLORS.sage,
      IN_PROGRESS: UI_COLORS.info,
      COMPLETED: UI_COLORS.success,
      CANCELLED: UI_COLORS.muted,
      DISPUTED: UI_COLORS.error,
    } as Record<string, string>
  )[status] ?? UI_COLORS.muted
}

interface KpiCardProps {
  label: string
  value: string
  tone: 'text' | 'gold' | 'goldLight' | 'warning'
  isLoading: boolean
}

function KpiCard({ label, value, tone, isLoading }: KpiCardProps) {
  const colorMap = {
    text: UI_COLORS.text,
    gold: UI_COLORS.gold,
    goldLight: '#D4B873',
    warning: UI_COLORS.warning,
  }
  return (
    <View style={styles.kpiCard}>
      {isLoading ? (
        <Skeleton width="80%" height={20} />
      ) : (
        <Text style={[styles.kpiValue, { color: colorMap[tone] }]}>{value}</Text>
      )}
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  )
}

function ActionTile({
  glyph,
  label,
  onPress,
}: {
  glyph: string
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.actionGlyph}>{glyph}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  greeting: { fontSize: 22, fontWeight: '700', color: UI_COLORS.text },
  greetingName: { color: UI_COLORS.gold },
  greetingSubtitle: { fontSize: 13, color: UI_COLORS.muted, marginTop: 4 },
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
  heroEquivalent: { fontSize: 12, color: UI_COLORS.muted, marginTop: 4 },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  kpiCard: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 14,
    backgroundColor: UI_COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    minHeight: 80,
    justifyContent: 'space-between',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  kpiLabel: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  aptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: UI_COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    gap: 12,
  },
  aptStatusLine: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  aptTimeBlock: { width: 56, alignItems: 'center' },
  aptTime: {
    fontSize: 16,
    fontWeight: '800',
    color: UI_COLORS.text,
    fontVariant: ['tabular-nums'],
  },
  aptService: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text },
  aptClient: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
  aptBottomRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  actionTile: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: 16,
    backgroundColor: UI_COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    alignItems: 'center',
    gap: 8,
  },
  actionGlyph: { fontSize: 28 },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.text,
    textAlign: 'center',
  },
})
