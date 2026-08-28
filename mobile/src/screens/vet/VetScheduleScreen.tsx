import React, { useMemo, useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
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
import WeekScheduleEditor, {
  ScheduleSlot,
} from '../../components/schedule/WeekScheduleEditor'
import { useAppointmentsQuery, useScheduleExceptionsQuery } from '../../hooks/queries/useMobileQueries'
import {
  useUpsertScheduleExceptionMutation,
  useDeleteScheduleExceptionMutation,
} from '../../hooks/queries/useMobileMutations'
import { pluralize } from '../../utils/format'

/**
 * VetScheduleScreen — agenda semanal del veterinario.
 *
 * Capacidades:
 *  - Selector de semana (anterior / siguiente / hoy)
 *  - WeekScheduleEditor con grid 7×11 (lun-dom × 8:00-18:00)
 *  - Cada celda con cita reservada se ve con datos del cliente
 *  - Tap en celda libre → toggle bloqueo (con confirmación de Alert)
 *  - Summary de la semana: cantidad de citas, ingresos esperados, slots libres
 *
 * Decisiones:
 *  - El estado `weekOffset` se mantiene en memoria (perderlo al cerrar la app es OK)
 *  - Las citas vienen de `useAppointmentsQuery({ startDate, endDate })`
 *  - Los bloqueos manuales viven en local state hasta que se integre el endpoint
 *    `POST /vets/me/schedule/exceptions` (al final del Sprint 3)
 */

interface Props {
  navigation: any
}

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=domingo, 1=lunes...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatWeekLabel(start: Date): string {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

  const sameMonth = start.getMonth() === end.getMonth()
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`
  }
  return `${start.getDate()} ${months[start.getMonth()]} – ${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`
}

export default function VetScheduleScreen({ navigation }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)

  // Bloqueos locales (UI): Map<"YYYY-MM-DD", true> synced to/from backend
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set())

  const upsertException = useUpsertScheduleExceptionMutation()
  const deleteException = useDeleteScheduleExceptionMutation()

  // Calcular el lunes de la semana actual + offset
  const monday = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + weekOffset * 7)
    return getMondayOf(d)
  }, [weekOffset])

  const weekStart = useMemo(() => formatIsoDate(monday), [monday])
  const weekEnd = useMemo(() => {
    const d = new Date(monday)
    d.setDate(d.getDate() + 6)
    return formatIsoDate(d)
  }, [monday])

  // Query de citas en el rango
  const apptsQuery = useAppointmentsQuery({
    startDate: weekStart,
    endDate: weekEnd,
  })
  const appointments = apptsQuery.data ?? []

  // Query de excepciones del servidor (bloqueos persistidos)
  const exceptionsQuery = useScheduleExceptionsQuery(weekStart, weekEnd)

  // Sincronizar excepciones del servidor a estado local al cargar la semana
  useEffect(() => {
    if (!exceptionsQuery.data) return
    const blocked = new Set<string>()
    for (const ex of exceptionsQuery.data) {
      if (!ex.isAvailable) {
        // Normalize ISO date to YYYY-MM-DD
        blocked.add(ex.date.slice(0, 10))
      }
    }
    setBlockedDates(blocked)
  }, [exceptionsQuery.data])

  // Convertir citas + bloqueos a ScheduleSlots
  const slots: ScheduleSlot[] = useMemo(() => {
    const slotList: ScheduleSlot[] = []

    // Slots reservados (citas)
    for (const apt of appointments) {
      // Convertir time "HH:mm" o "HH:mm:ss" a "HH:00" (alinear con grid horario)
      const hourPart = apt.time?.slice(0, 2) ?? '00'
      const dateStr = (apt.date || '').slice(0, 10)
      slotList.push({
        date: dateStr,
        time: `${hourPart}:00`,
        appointmentId: apt.id,
        appointmentLabel: apt.pet?.name ?? apt.serviceType.slice(0, 8),
      })
    }

    // Bloqueados: marcar todos los slots de los días bloqueados
    const TIMES = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00']
    for (const date of blockedDates) {
      for (const time of TIMES) {
        slotList.push({ date, time, blocked: true })
      }
    }

    return slotList
  }, [appointments, blockedDates])

  // Summary
  const summary = useMemo(() => {
    const inRange = appointments.filter(
      (a) => a.status !== 'CANCELLED',
    )
    const totalRevenue = inRange.reduce(
      (sum, a) => sum + (a.amount ?? 0),
      0,
    )
    return {
      count: inRange.length,
      revenue: totalRevenue,
      blocked: blockedDates.size,
    }
  }, [appointments, blockedDates])

  const handleSlotPress = useCallback(
    (slot: ScheduleSlot) => {
      if (!slot.appointmentId) return
      navigation.navigate('VetAppointmentDetail', {
        appointmentId: slot.appointmentId,
      })
    },
    [navigation],
  )

  const handleToggleAvailability = useCallback(
    (date: string, _time: string, _currentlyBlocked: boolean) => {
      const isDateBlocked = blockedDates.has(date)
      const action = isDateBlocked ? 'liberar' : 'bloquear'
      Alert.alert(
        isDateBlocked ? 'Liberar día completo' : 'Bloquear día completo',
        `¿Quieres ${action} el día ${date}? Los clientes ${
          isDateBlocked
            ? 'podrán reservar citas ese día nuevamente'
            : 'no podrán reservar citas ese día'
        }.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Confirmar',
            onPress: () => {
              if (isDateBlocked) {
                // Optimistic update
                setBlockedDates((prev) => {
                  const next = new Set(prev)
                  next.delete(date)
                  return next
                })
                deleteException.mutate(date, {
                  onError: () => {
                    // Rollback
                    setBlockedDates((prev) => new Set([...prev, date]))
                    Alert.alert('Error', 'No se pudo liberar el horario. Intenta de nuevo.')
                  },
                })
              } else {
                // Optimistic update
                setBlockedDates((prev) => new Set([...prev, date]))
                upsertException.mutate({ dateStr: date, data: { isAvailable: false } }, {
                  onError: () => {
                    // Rollback
                    setBlockedDates((prev) => {
                      const next = new Set(prev)
                      next.delete(date)
                      return next
                    })
                    Alert.alert('Error', 'No se pudo bloquear el horario. Intenta de nuevo.')
                  },
                })
              }
            },
          },
        ],
      )
    },
    [blockedDates, upsertException, deleteException],
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Mi agenda</Text>
        <Text style={styles.subtitle}>
          Gestiona tu disponibilidad semanal
        </Text>
      </View>

      {/* Week selector */}
      <View style={styles.weekSelector}>
        <Pressable
          onPress={() => setWeekOffset((w) => w - 1)}
          hitSlop={8}
          style={styles.weekNav}
          accessibilityRole="button"
          accessibilityLabel="Semana anterior"
        >
          <Text style={styles.weekNavGlyph}>‹</Text>
        </Pressable>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.weekLabel}>{formatWeekLabel(monday)}</Text>
          {weekOffset !== 0 && (
            <Pressable
              onPress={() => setWeekOffset(0)}
              hitSlop={6}
              accessibilityRole="link"
            >
              <Text style={styles.weekTodayLink}>Volver a esta semana</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => setWeekOffset((w) => w + 1)}
          hitSlop={8}
          style={styles.weekNav}
          accessibilityRole="button"
          accessibilityLabel="Semana siguiente"
        >
          <Text style={styles.weekNavGlyph}>›</Text>
        </Pressable>
      </View>

      {/* Summary chips */}
      <View style={styles.summaryRow}>
        <SummaryChip
          glyph="📋"
          label={pluralize(summary.count, 'cita', 'citas')}
          tone="gold"
        />
        <SummaryChip
          glyph="🚫"
          label={pluralize(summary.blocked, 'bloqueo', 'bloqueos')}
          tone="muted"
        />
      </View>

      {/* Editor */}
      <View style={{ flex: 1 }}>
        {apptsQuery.isLoading ? (
          <View style={{ padding: 16 }}>
            <Skeleton width="100%" height={300} borderRadius={12} />
          </View>
        ) : apptsQuery.isError ? (
          <View style={styles.centered}>
            <EmptyState
              glyph="⚠️"
              title="Error al cargar la agenda"
              actionLabel="Reintentar"
              onAction={() => apptsQuery.refetch()}
            />
          </View>
        ) : (
          <WeekScheduleEditor
            weekStart={weekStart}
            slots={slots}
            onSlotPress={handleSlotPress}
            onToggleAvailability={handleToggleAvailability}
          />
        )}
      </View>
    </SafeAreaView>
  )
}

interface SummaryChipProps {
  glyph: string
  label: string
  tone: 'sage' | 'gold' | 'muted'
}

function SummaryChip({ glyph, label, tone }: SummaryChipProps) {
  return (
    <View style={styles.summaryChip}>
      <Text style={styles.summaryGlyph}>{glyph}</Text>
      <Badge label={label} tone={tone} size="sm" outline />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '800', color: UI_COLORS.text },
  subtitle: { fontSize: 13, color: UI_COLORS.muted, marginTop: 4 },
  weekSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: UI_COLORS.card,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: UI_COLORS.border,
    marginTop: 12,
  },
  weekNav: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: UI_COLORS.borderLight,
  },
  weekNavGlyph: { fontSize: 24, color: UI_COLORS.text, fontWeight: '600' },
  weekLabel: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text },
  weekTodayLink: {
    fontSize: 11,
    color: UI_COLORS.gold,
    marginTop: 2,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryGlyph: { fontSize: 16 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
})
