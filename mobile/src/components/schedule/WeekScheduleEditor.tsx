import React, { useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native'
import { UI_COLORS } from '../ui/primitives'

/**
 * WeekScheduleEditor — calendario semanal de slots horarios para el vet.
 *
 * Diseño:
 *  - Header con 7 columnas (lun a dom + número de día)
 *  - Filas de slots horarios (configurable startHour..endHour, default 8..19)
 *  - Cada slot:
 *    * Vacío: tap para crear bloqueo (callback `onToggleAvailability`)
 *    * Reservado: tap para abrir detalle de cita (callback `onSlotPress`)
 *    * Bloqueado: tap para volver a disponible
 *  - Hoy se resalta con tint sutil
 *  - Slots pasados (anteriores a now) se renderizan con opacidad 0.4
 *
 * Performance:
 *  - Memoiza la grilla en `useMemo` por `weekStart` + `appointments`
 *  - ScrollView vertical con sticky header (en plataformas que lo soportan)
 */

export interface ScheduleSlot {
  /** ISO date YYYY-MM-DD */
  date: string
  /** HH:mm */
  time: string
  /** Si tiene una cita asociada */
  appointmentId?: string
  /** Resumen breve para mostrar en el chip */
  appointmentLabel?: string
  /** Bloqueado manualmente por el vet */
  blocked?: boolean
}

interface Props {
  /** Lunes de la semana en formato YYYY-MM-DD */
  weekStart: string
  /** Slots con datos del backend (citas + bloqueos) */
  slots: ScheduleSlot[]
  startHour?: number
  endHour?: number
  onSlotPress?: (slot: ScheduleSlot) => void
  onToggleAvailability?: (date: string, time: string, currentlyBlocked: boolean) => void
}

const WEEKDAY_LABELS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

export default function WeekScheduleEditor({
  weekStart,
  slots,
  startHour = 8,
  endHour = 19,
  onSlotPress,
  onToggleAvailability,
}: Props) {
  // Generar las 7 fechas de la semana
  const weekDates = useMemo(() => {
    const start = new Date(`${weekStart}T00:00:00`)
    const dates: Array<{
      iso: string
      dayNum: string
      isToday: boolean
      isPast: boolean
    }> = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      dates.push({
        iso: `${yyyy}-${mm}-${dd}`,
        dayNum: String(d.getDate()),
        isToday: d.getTime() === today.getTime(),
        isPast: d.getTime() < today.getTime(),
      })
    }
    return dates
  }, [weekStart])

  // Generar las horas
  const hours = useMemo(() => {
    const arr: string[] = []
    for (let h = startHour; h < endHour; h++) {
      arr.push(`${String(h).padStart(2, '0')}:00`)
    }
    return arr
  }, [startHour, endHour])

  // Index slots por (date, time) para lookup O(1)
  const slotMap = useMemo(() => {
    const map = new Map<string, ScheduleSlot>()
    for (const s of slots) {
      map.set(`${s.date}|${s.time}`, s)
    }
    return map
  }, [slots])

  return (
    <View style={styles.container}>
      {/* Header de días */}
      <View style={styles.headerRow}>
        <View style={styles.timeColumnHeader} />
        {weekDates.map((d, i) => (
          <View
            key={d.iso}
            style={[
              styles.dayHeaderCell,
              d.isToday && styles.dayHeaderCellToday,
            ]}
          >
            <Text
              style={[
                styles.dayHeaderLabel,
                d.isToday && styles.dayHeaderLabelToday,
              ]}
            >
              {WEEKDAY_LABELS[i]}
            </Text>
            <Text
              style={[
                styles.dayHeaderNum,
                d.isToday && styles.dayHeaderNumToday,
              ]}
            >
              {d.dayNum}
            </Text>
          </View>
        ))}
      </View>

      {/* Cuerpo del calendario */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {hours.map((hour) => (
          <View key={hour} style={styles.bodyRow}>
            <View style={styles.timeColumn}>
              <Text style={styles.timeLabel}>{hour}</Text>
            </View>
            {weekDates.map((d) => {
              const slot = slotMap.get(`${d.iso}|${hour}`)
              const isBooked = !!slot?.appointmentId
              const isBlocked = !!slot?.blocked
              const isPast = d.isPast

              return (
                <Pressable
                  key={`${d.iso}-${hour}`}
                  onPress={() => {
                    if (isPast) return
                    if (isBooked && onSlotPress) {
                      onSlotPress(slot!)
                    } else if (onToggleAvailability) {
                      onToggleAvailability(d.iso, hour, isBlocked)
                    }
                  }}
                  disabled={isPast}
                  style={[
                    styles.cell,
                    d.isToday && styles.cellToday,
                    isBooked && styles.cellBooked,
                    isBlocked && styles.cellBlocked,
                    isPast && styles.cellPast,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${WEEKDAY_LABELS[weekDates.indexOf(d)]} ${d.dayNum} a las ${hour}, ${
                    isBooked
                      ? `reservado: ${slot?.appointmentLabel ?? 'cita'}`
                      : isBlocked
                      ? 'bloqueado'
                      : 'disponible'
                  }`}
                  accessibilityState={{ disabled: isPast }}
                >
                  {isBooked && slot?.appointmentLabel && (
                    <Text style={styles.cellLabel} numberOfLines={2}>
                      {slot.appointmentLabel}
                    </Text>
                  )}
                  {isBlocked && (
                    <View style={styles.blockedHash}>
                      <Text style={styles.blockedGlyph}>×</Text>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </View>
        ))}
      </ScrollView>

      {/* Leyenda */}
      <View style={styles.legend}>
        <LegendItem color={UI_COLORS.card} borderColor={UI_COLORS.border} label="Disponible" />
        <LegendItem color={UI_COLORS.gold} label="Reservado" />
        <LegendItem color={UI_COLORS.borderLight} label="Bloqueado" />
      </View>
    </View>
  )
}

interface LegendItemProps {
  color: string
  borderColor?: string
  label: string
}

function LegendItem({ color, borderColor, label }: LegendItemProps) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSwatch,
          { backgroundColor: color, borderColor: borderColor ?? color },
        ]}
      />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  )
}

const CELL_HEIGHT = 44
const TIME_COL_WIDTH = 44

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
  },
  timeColumnHeader: { width: TIME_COL_WIDTH },
  dayHeaderCell: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: UI_COLORS.borderLight,
  },
  dayHeaderCellToday: { backgroundColor: '#C9A9610a' },
  dayHeaderLabel: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  dayHeaderLabelToday: { color: UI_COLORS.gold },
  dayHeaderNum: { fontSize: 16, color: UI_COLORS.text, fontWeight: '700' },
  dayHeaderNumToday: { color: UI_COLORS.gold },
  bodyRow: {
    flexDirection: 'row',
    height: CELL_HEIGHT,
  },
  timeColumn: {
    width: TIME_COL_WIDTH,
    paddingTop: 4,
    alignItems: 'center',
    backgroundColor: UI_COLORS.card,
    borderRightWidth: 1,
    borderRightColor: UI_COLORS.borderLight,
  },
  timeLabel: { fontSize: 11, color: UI_COLORS.muted, fontWeight: '600' },
  cell: {
    flex: 1,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: UI_COLORS.borderLight,
    backgroundColor: UI_COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cellToday: { backgroundColor: '#C9A9610a' },
  cellBooked: {
    backgroundColor: UI_COLORS.gold,
    borderColor: UI_COLORS.gold,
  },
  cellBlocked: {
    backgroundColor: UI_COLORS.borderLight,
    borderColor: UI_COLORS.border,
  },
  cellPast: { opacity: 0.4 },
  cellLabel: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  blockedHash: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedGlyph: {
    fontSize: 18,
    color: UI_COLORS.muted,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.borderLight,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
  },
  legendLabel: { fontSize: 11, color: UI_COLORS.muted, fontWeight: '500' },
})
