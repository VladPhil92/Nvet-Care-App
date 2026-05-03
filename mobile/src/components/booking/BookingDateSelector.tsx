import React, { useMemo, useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { UI_COLORS, EmptyState } from '../ui/primitives'
import { useVetScheduleQuery } from '../../hooks/queries/useMobileQueries'

/**
 * BookingDateSelector — selector de fecha + slot horario con datos del backend.
 *
 * Diseño:
 *  - Strip horizontal con próximos 14 días (Hoy, Mañana, lun 02, mar 03…)
 *  - Día seleccionado dispara `useVetScheduleQuery(vetId, date)`
 *  - Grid responsive de slots horarios (mañana / tarde / noche)
 *  - Slots no disponibles se renderizan deshabilitados con opacidad
 *  - Auto-scroll a hoy al montar
 *
 * a11y:
 *  - Cada día tiene `accessibilityLabel` con día completo + estado
 *  - Cada slot tiene `accessibilityState={{ disabled, selected }}`
 *  - `accessibilityLiveRegion="polite"` en grid para anuncios al cambiar día
 */

interface Props {
  vetId: string
  selectedDate: string | null // ISO date 'YYYY-MM-DD'
  selectedTime: string | null // 'HH:mm'
  onSelect: (date: string, time: string) => void
}

const DAYS_TO_SHOW = 14
const WEEKDAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

interface DateOption {
  iso: string // YYYY-MM-DD
  label: string // "Hoy", "Mañana", "lun"
  dayNum: string // "02"
  monthShort: string // "may"
  isToday: boolean
  isWeekend: boolean
}

function buildDateOptions(): DateOption[] {
  const options: DateOption[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < DAYS_TO_SHOW; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const iso = `${yyyy}-${mm}-${dd}`

    let label: string
    if (i === 0) label = 'Hoy'
    else if (i === 1) label = 'Mañana'
    else label = WEEKDAY_LABELS[d.getDay()]

    options.push({
      iso,
      label,
      dayNum: String(d.getDate()),
      monthShort: MONTH_LABELS[d.getMonth()],
      isToday: i === 0,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    })
  }
  return options
}

function groupSlotsByPeriod(slots: Array<{ time: string; available: boolean }>) {
  const morning: typeof slots = []
  const afternoon: typeof slots = []
  const evening: typeof slots = []

  for (const slot of slots) {
    const hour = parseInt(slot.time.slice(0, 2), 10)
    if (hour < 12) morning.push(slot)
    else if (hour < 18) afternoon.push(slot)
    else evening.push(slot)
  }
  return { morning, afternoon, evening }
}

export default function BookingDateSelector({
  vetId,
  selectedDate,
  selectedTime,
  onSelect,
}: Props) {
  const dateOptions = useMemo(() => buildDateOptions(), [])
  const dateScrollRef = useRef<ScrollView>(null)

  // Auto-scroll al día seleccionado al cambiar (default: hoy)
  useEffect(() => {
    if (dateScrollRef.current && selectedDate) {
      const idx = dateOptions.findIndex((o) => o.iso === selectedDate)
      if (idx >= 0) {
        dateScrollRef.current.scrollTo({ x: idx * 76, animated: true })
      }
    }
  }, [selectedDate, dateOptions])

  const scheduleQuery = useVetScheduleQuery(vetId, selectedDate ?? undefined)
  const slots = scheduleQuery.data ?? []
  const grouped = useMemo(() => groupSlotsByPeriod(slots), [slots])

  return (
    <View style={styles.container}>
      {/* Date strip */}
      <Text style={styles.sectionLabel}>Selecciona el día</Text>
      <ScrollView
        ref={dateScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStrip}
        accessibilityRole="tablist"
      >
        {dateOptions.map((opt) => {
          const isSelected = opt.iso === selectedDate
          return (
            <Pressable
              key={opt.iso}
              onPress={() => onSelect(opt.iso, '')}
              style={[
                styles.dateChip,
                isSelected && styles.dateChipSelected,
                opt.isWeekend && !isSelected && styles.dateChipWeekend,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${opt.label} ${opt.dayNum} de ${opt.monthShort}`}
            >
              <Text
                style={[
                  styles.dateLabel,
                  isSelected && styles.dateLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
              <Text
                style={[
                  styles.dateNum,
                  isSelected && styles.dateNumSelected,
                ]}
              >
                {opt.dayNum}
              </Text>
              <Text
                style={[
                  styles.dateMonth,
                  isSelected && styles.dateMonthSelected,
                ]}
              >
                {opt.monthShort}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Slots grid */}
      <View style={{ marginTop: 20 }} accessibilityLiveRegion="polite">
        <Text style={styles.sectionLabel}>Horarios disponibles</Text>

        {!selectedDate ? (
          <Text style={styles.helper}>
            Selecciona un día para ver los horarios disponibles
          </Text>
        ) : scheduleQuery.isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={UI_COLORS.sage} />
            <Text style={styles.loadingText}>Cargando agenda…</Text>
          </View>
        ) : scheduleQuery.isError ? (
          <Text style={styles.errorText}>
            No pudimos cargar la agenda. Intenta de nuevo.
          </Text>
        ) : slots.length === 0 ? (
          <EmptyState
            glyph="🗓️"
            title="Sin disponibilidad"
            subtitle="El veterinario no tiene horarios disponibles este día. Prueba con otra fecha."
          />
        ) : (
          <View>
            {grouped.morning.length > 0 && (
              <SlotGroup
                title="Mañana"
                slots={grouped.morning}
                selectedTime={selectedTime}
                onSelect={(time) => onSelect(selectedDate, time)}
              />
            )}
            {grouped.afternoon.length > 0 && (
              <SlotGroup
                title="Tarde"
                slots={grouped.afternoon}
                selectedTime={selectedTime}
                onSelect={(time) => onSelect(selectedDate, time)}
              />
            )}
            {grouped.evening.length > 0 && (
              <SlotGroup
                title="Noche"
                slots={grouped.evening}
                selectedTime={selectedTime}
                onSelect={(time) => onSelect(selectedDate, time)}
              />
            )}
          </View>
        )}
      </View>
    </View>
  )
}

interface SlotGroupProps {
  title: string
  slots: Array<{ time: string; available: boolean }>
  selectedTime: string | null
  onSelect: (time: string) => void
}

function SlotGroup({ title, slots, selectedTime, onSelect }: SlotGroupProps) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.slotGrid}>
        {slots.map((slot) => {
          const isSelected = slot.time === selectedTime
          const isDisabled = !slot.available
          return (
            <Pressable
              key={slot.time}
              onPress={() => !isDisabled && onSelect(slot.time)}
              disabled={isDisabled}
              style={[
                styles.slotChip,
                isSelected && styles.slotChipSelected,
                isDisabled && styles.slotChipDisabled,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDisabled, selected: isSelected }}
              accessibilityLabel={`${slot.time}${
                isDisabled ? ' (no disponible)' : ''
              }`}
            >
              <Text
                style={[
                  styles.slotText,
                  isSelected && styles.slotTextSelected,
                  isDisabled && styles.slotTextDisabled,
                ]}
              >
                {slot.time}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 10,
  },
  dateStrip: { gap: 8, paddingVertical: 4 },
  dateChip: {
    width: 68,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: UI_COLORS.card,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    alignItems: 'center',
  },
  dateChipSelected: {
    backgroundColor: UI_COLORS.sage,
    borderColor: UI_COLORS.sage,
  },
  dateChipWeekend: { backgroundColor: '#F8F6EE' },
  dateLabel: {
    fontSize: 11,
    color: UI_COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  dateLabelSelected: { color: '#FFFFFF' },
  dateNum: {
    fontSize: 20,
    fontWeight: '800',
    color: UI_COLORS.text,
    marginTop: 2,
  },
  dateNumSelected: { color: '#FFFFFF' },
  dateMonth: { fontSize: 11, color: UI_COLORS.muted, marginTop: 2 },
  dateMonthSelected: { color: '#FFFFFFcc' },
  helper: { fontSize: 13, color: UI_COLORS.muted, marginTop: 8 },
  loadingBox: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadingText: { color: UI_COLORS.muted, fontSize: 13 },
  errorText: { color: UI_COLORS.error, fontSize: 13, paddingVertical: 16 },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.muted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    minWidth: 76,
    alignItems: 'center',
  },
  slotChipSelected: {
    backgroundColor: UI_COLORS.sage,
    borderColor: UI_COLORS.sage,
  },
  slotChipDisabled: {
    backgroundColor: UI_COLORS.borderLight,
    borderColor: UI_COLORS.border,
    opacity: 0.55,
  },
  slotText: { fontSize: 14, fontWeight: '600', color: UI_COLORS.text },
  slotTextSelected: { color: '#FFFFFF' },
  slotTextDisabled: { color: UI_COLORS.muted, textDecorationLine: 'line-through' },
})
