import React, { useMemo, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Badge,
  Skeleton,
  EmptyState,
  UI_COLORS,
} from '../../components/ui/primitives'
import {
  formatAppointmentDate,
  formatCOP,
  pluralize,
} from '../../utils/format'
import { useAppointmentsQuery } from '../../hooks/queries/useMobileQueries'
import { useCancelAppointmentMutation } from '../../hooks/queries/useMobileMutations'
import type { Appointment } from '../../services/appointment.service'

/**
 * MyAppointmentsScreen — pantalla de "mis citas" del cliente.
 *
 * Layout:
 *  - Header con título "Mis citas" y contador
 *  - Segmented control: Próximas (PENDING/CONFIRMED/IN_PROGRESS) | Pasadas (COMPLETED/CANCELLED)
 *  - FlatList con AppointmentCard
 *  - Pull-to-refresh
 *  - Cancelación con optimistic update (Alert de confirmación primero)
 *  - 5 estados: loading / error / success / empty (por segmento) / refreshing
 *
 * Decisiones:
 *  - Se hace una sola query a `useAppointmentsQuery({})` y se filtra en memoria
 *    por segmento → menos round-trips, mejor offline experience
 *  - El segmented control mantiene state local (no en URL); el segmento por
 *    default es "Próximas"
 *  - Cancelación: confirmación con Alert + optimistic update; si falla, rollback
 *  - Tap en una cita navega al detalle
 *  - `accessibilityRole="tablist"` en el segmented control
 */

interface Props {
  navigation: any
}

type SegmentId = 'upcoming' | 'past'

const ACTIVE_STATUSES: Array<Appointment['status']> = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
]

const PAST_STATUSES: Array<Appointment['status']> = [
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
]

const STATUS_LABELS: Record<Appointment['status'], string> = {
  PENDING: 'Por confirmar',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  DISPUTED: 'En disputa',
}

const STATUS_TONES: Record<
  Appointment['status'],
  'sage' | 'gold' | 'success' | 'warning' | 'error' | 'info' | 'muted'
> = {
  PENDING: 'warning',
  CONFIRMED: 'sage',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'muted',
  DISPUTED: 'error',
}

export default function MyAppointmentsScreen({ navigation }: Props) {
  const [segment, setSegment] = useState<SegmentId>('upcoming')

  const appointmentsQuery = useAppointmentsQuery({})
  const cancelMutation = useCancelAppointmentMutation()

  const allAppointments = appointmentsQuery.data ?? []

  const filtered = useMemo(() => {
    const list =
      segment === 'upcoming'
        ? allAppointments.filter((a) =>
            ACTIVE_STATUSES.includes(a.status),
          )
        : allAppointments.filter((a) => PAST_STATUSES.includes(a.status))

    // Ordenar próximas asc (más cercana primero), pasadas desc (más reciente primero)
    return list.sort((a, b) => {
      const aTs = new Date(a.date).getTime()
      const bTs = new Date(b.date).getTime()
      return segment === 'upcoming' ? aTs - bTs : bTs - aTs
    })
  }, [allAppointments, segment])

  const counts = useMemo(() => {
    let upcoming = 0
    let past = 0
    for (const a of allAppointments) {
      if (ACTIVE_STATUSES.includes(a.status)) upcoming++
      else if (PAST_STATUSES.includes(a.status)) past++
    }
    return { upcoming, past }
  }, [allAppointments])

  const handleCancel = useCallback(
    (apt: Appointment) => {
      Alert.alert(
        'Cancelar cita',
        `¿Seguro que quieres cancelar tu cita de ${apt.serviceType} con Dr. ${apt.vet.firstName} ${apt.vet.lastName}?`,
        [
          { text: 'Mantener cita', style: 'cancel' },
          {
            text: 'Cancelar cita',
            style: 'destructive',
            onPress: () => {
              cancelMutation.mutate(
                { id: apt.id, reason: 'Cancelada por el cliente' },
                {
                  onError: (err: any) => {
                    Alert.alert(
                      'Error',
                      err?.response?.data?.message ||
                        'No pudimos cancelar la cita. Intenta de nuevo.',
                    )
                  },
                },
              )
            },
          },
        ],
      )
    },
    [cancelMutation],
  )

  const handlePress = useCallback(
    (apt: Appointment) => {
      navigation.navigate('AppointmentDetail', { appointmentId: apt.id })
    },
    [navigation],
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Mis citas</Text>
        {!appointmentsQuery.isLoading && (
          <Text style={styles.subtitle}>
            {pluralize(allAppointments.length, 'cita registrada', 'citas registradas')}
          </Text>
        )}
      </View>

      {/* Segmented control */}
      <View
        style={styles.segmentControl}
        accessibilityRole="tablist"
        accessibilityLabel="Filtrar mis citas"
      >
        <SegmentTab
          id="upcoming"
          label="Próximas"
          count={counts.upcoming}
          isActive={segment === 'upcoming'}
          onPress={() => setSegment('upcoming')}
        />
        <SegmentTab
          id="past"
          label="Pasadas"
          count={counts.past}
          isActive={segment === 'past'}
          onPress={() => setSegment('past')}
        />
      </View>

      {/* List */}
      {appointmentsQuery.isLoading ? (
        <View style={styles.loadingList}>
          {[0, 1, 2].map((i) => (
            <Card key={i} style={{ marginBottom: 10 }}>
              <Skeleton width="50%" height={14} />
              <View style={{ height: 8 }} />
              <Skeleton width="80%" height={18} />
              <View style={{ height: 8 }} />
              <Skeleton width="40%" height={12} />
            </Card>
          ))}
        </View>
      ) : appointmentsQuery.isError ? (
        <View style={styles.centered}>
          <EmptyState
            glyph="⚠️"
            title="No pudimos cargar tus citas"
            subtitle="Verifica tu conexión e intenta nuevamente."
            actionLabel="Reintentar"
            onAction={() => appointmentsQuery.refetch()}
          />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <AppointmentCard
              appointment={item}
              segment={segment}
              onPress={() => handlePress(item)}
              onCancel={() => handleCancel(item)}
              isCancelling={
                cancelMutation.isPending &&
                cancelMutation.variables?.id === item.id
              }
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              {segment === 'upcoming' ? (
                <EmptyState
                  glyph="📅"
                  title="Sin citas próximas"
                  subtitle="Cuando reserves una cita, aparecerá aquí. Toca el botón para encontrar veterinarios cerca de ti."
                  actionLabel="Buscar veterinarios"
                  onAction={() => navigation.navigate('ClientSearch')}
                />
              ) : (
                <EmptyState
                  glyph="🐾"
                  title="Sin citas pasadas"
                  subtitle="Aquí verás el historial de tus citas completadas o canceladas."
                />
              )}
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={appointmentsQuery.isRefetching}
              onRefresh={() => appointmentsQuery.refetch()}
              colors={[UI_COLORS.sage]}
              tintColor={UI_COLORS.sage}
            />
          }
        />
      )}
    </SafeAreaView>
  )
}

// =====================================================================
// SegmentTab
// =====================================================================

interface SegmentTabProps {
  id: SegmentId
  label: string
  count: number
  isActive: boolean
  onPress: () => void
}

function SegmentTab({ id, label, count, isActive, onPress }: SegmentTabProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentTab, isActive && styles.segmentTabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={`${label}, ${count} ${count === 1 ? 'cita' : 'citas'}`}
    >
      <Text
        style={[
          styles.segmentLabel,
          isActive && styles.segmentLabelActive,
        ]}
      >
        {label}
      </Text>
      {count > 0 && (
        <View style={[styles.countBubble, isActive && styles.countBubbleActive]}>
          <Text
            style={[
              styles.countText,
              isActive && styles.countTextActive,
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

// =====================================================================
// AppointmentCard
// =====================================================================

interface AppointmentCardProps {
  appointment: Appointment
  segment: SegmentId
  onPress: () => void
  onCancel: () => void
  isCancelling: boolean
}

function AppointmentCard({
  appointment,
  segment,
  onPress,
  onCancel,
  isCancelling,
}: AppointmentCardProps) {
  const isOptimistic = (appointment as any)._optimistic
  const canCancel =
    segment === 'upcoming' &&
    (appointment.status === 'PENDING' || appointment.status === 'CONFIRMED') &&
    !isOptimistic

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isOptimistic && { opacity: 0.7 },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Cita con Dr. ${appointment.vet.firstName} ${appointment.vet.lastName}, ${appointment.serviceType}, ${formatAppointmentDate(appointment.date)} a las ${appointment.time}, estado ${STATUS_LABELS[appointment.status]}`}
      accessibilityHint="Toca para ver el detalle"
    >
      {/* Status row */}
      <View style={styles.cardTopRow}>
        <Badge
          label={STATUS_LABELS[appointment.status]}
          tone={STATUS_TONES[appointment.status]}
          size="sm"
        />
        <Text style={styles.cardAmount}>{formatCOP(appointment.amount)}</Text>
      </View>

      <Text style={styles.cardService} numberOfLines={1}>
        {appointment.serviceType}
      </Text>

      <Text style={styles.cardVet} numberOfLines={1}>
        Dr. {appointment.vet.firstName} {appointment.vet.lastName}
      </Text>

      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMeta}>
          📅 {formatAppointmentDate(appointment.date)} · {appointment.time}
        </Text>
        {appointment.pet && (
          <Text style={styles.cardMeta}>🐾 {appointment.pet.name}</Text>
        )}
      </View>

      {appointment.address && (
        <Text style={styles.cardAddress} numberOfLines={1}>
          📍 {appointment.address}
        </Text>
      )}

      {/* Cancel CTA si aplica */}
      {canCancel && (
        <View style={styles.cardActions}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.()
              onCancel()
            }}
            disabled={isCancelling}
            hitSlop={8}
            style={[styles.cancelLink, isCancelling && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Cancelar esta cita"
            accessibilityState={{ busy: isCancelling }}
          >
            <Text style={styles.cancelLinkText}>
              {isCancelling ? 'Cancelando…' : 'Cancelar cita'}
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  )
}

// =====================================================================
// STYLES
// =====================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: UI_COLORS.text },
  subtitle: { fontSize: 13, color: UI_COLORS.muted, marginTop: 4 },
  segmentControl: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: UI_COLORS.borderLight,
    borderRadius: 12,
    padding: 4,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentTabActive: {
    backgroundColor: UI_COLORS.card,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentLabel: { fontSize: 14, fontWeight: '600', color: UI_COLORS.muted },
  segmentLabelActive: { color: UI_COLORS.text },
  countBubble: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    backgroundColor: UI_COLORS.border,
    borderRadius: 10,
    alignItems: 'center',
  },
  countBubbleActive: { backgroundColor: UI_COLORS.sage },
  countText: { fontSize: 11, fontWeight: '700', color: UI_COLORS.muted },
  countTextActive: { color: '#FFFFFF' },
  loadingList: { padding: 16 },
  centered: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, flexGrow: 1 },
  // Card
  card: {
    backgroundColor: UI_COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardAmount: { fontSize: 14, fontWeight: '800', color: UI_COLORS.sage },
  cardService: { fontSize: 16, fontWeight: '700', color: UI_COLORS.text },
  cardVet: { fontSize: 13, color: UI_COLORS.muted, marginTop: 2 },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  cardMeta: { fontSize: 12, color: UI_COLORS.muted, fontWeight: '500' },
  cardAddress: { fontSize: 12, color: UI_COLORS.muted, marginTop: 6 },
  cardActions: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.borderLight,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelLink: { paddingVertical: 6, paddingHorizontal: 10 },
  cancelLinkText: {
    fontSize: 13,
    color: UI_COLORS.error,
    fontWeight: '600',
  },
})
