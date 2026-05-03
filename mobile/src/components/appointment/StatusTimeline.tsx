import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import { UI_COLORS } from '../ui/primitives'
import { formatRelativeTime } from '../../utils/format'

/**
 * StatusTimeline — visualización vertical del progreso de una cita.
 *
 * Diseño:
 *  - 4 puntos: PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
 *  - Línea vertical conectora entre dots
 *  - Estado actual: dot lleno con animación de pulso
 *  - Estados pasados: dot lleno con check, línea sage
 *  - Estados futuros: dot outline, línea borderLight
 *  - DISPUTED y CANCELLED se renderizan como rama lateral con tono error/muted
 *
 * Props:
 *  - currentStatus: estado actual del backend
 *  - timeline: array opcional con timestamps por evento
 */

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'

interface TimelineEvent {
  status: AppointmentStatus
  timestamp: string
  completed: boolean
}

interface Props {
  currentStatus: AppointmentStatus
  timeline?: TimelineEvent[]
}

const HAPPY_PATH: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
]

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  PENDING: 'Solicitada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'Vet en camino',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  DISPUTED: 'En disputa',
}

const STATUS_DESCRIPTIONS: Record<AppointmentStatus, string> = {
  PENDING: 'Esperando confirmación del veterinario',
  CONFIRMED: 'El vet aceptó la cita y se prepara',
  IN_PROGRESS: 'El vet está en camino o atendiendo',
  COMPLETED: 'Servicio completado exitosamente',
  CANCELLED: 'La cita fue cancelada',
  DISPUTED: 'Hay una disputa abierta',
}

export default function StatusTimeline({ currentStatus, timeline }: Props) {
  const isCancelled = currentStatus === 'CANCELLED'
  const isDisputed = currentStatus === 'DISPUTED'
  const isAlternativePath = isCancelled || isDisputed

  // Helper: obtener timestamp del evento (si existe)
  const getEventTime = (status: AppointmentStatus): string | null => {
    const event = timeline?.find((e) => e.status === status)
    return event?.timestamp ?? null
  }

  return (
    <View style={styles.container} accessibilityLabel="Línea de tiempo del estado de la cita">
      {HAPPY_PATH.map((status, idx) => {
        const currentIdx = HAPPY_PATH.indexOf(currentStatus)
        const isPast =
          !isAlternativePath && currentIdx >= 0 && idx < currentIdx
        const isCurrent =
          !isAlternativePath && status === currentStatus
        const isFuture =
          !isAlternativePath && currentIdx >= 0 && idx > currentIdx
        const eventTime = getEventTime(status)

        const dotState: 'past' | 'current' | 'future' =
          isPast ? 'past' : isCurrent ? 'current' : 'future'

        return (
          <TimelineRow
            key={status}
            label={STATUS_LABELS[status]}
            description={STATUS_DESCRIPTIONS[status]}
            time={eventTime}
            dotState={dotState}
            isLast={idx === HAPPY_PATH.length - 1}
            connectorColor={
              !isAlternativePath && idx < currentIdx
                ? UI_COLORS.sage
                : UI_COLORS.borderLight
            }
          />
        )
      })}

      {/* Branch alternativo: cancelado o disputado */}
      {isAlternativePath && (
        <View style={styles.alternativeBranch}>
          <View
            style={[
              styles.altDot,
              {
                backgroundColor: isCancelled
                  ? UI_COLORS.muted
                  : UI_COLORS.error,
              },
            ]}
            accessibilityLabel="Estado alternativo"
          >
            <Text style={styles.altGlyph}>{isCancelled ? '✕' : '!'}</Text>
          </View>
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text
              style={[
                styles.altLabel,
                {
                  color: isCancelled ? UI_COLORS.muted : UI_COLORS.error,
                },
              ]}
            >
              {STATUS_LABELS[currentStatus]}
            </Text>
            <Text style={styles.altDescription}>
              {STATUS_DESCRIPTIONS[currentStatus]}
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}

interface TimelineRowProps {
  label: string
  description: string
  time: string | null
  dotState: 'past' | 'current' | 'future'
  isLast: boolean
  connectorColor: string
}

function TimelineRow({
  label,
  description,
  time,
  dotState,
  isLast,
  connectorColor,
}: TimelineRowProps) {
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (dotState !== 'current') return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [dotState, pulse])

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] })
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  })

  return (
    <View style={styles.row}>
      <View style={styles.dotColumn}>
        {/* Pulse ring (solo en current) */}
        {dotState === 'current' && (
          <Animated.View
            style={[
              styles.pulseRing,
              { transform: [{ scale }], opacity },
            ]}
          />
        )}

        {/* Dot */}
        <View
          style={[
            styles.dot,
            dotState === 'past' && styles.dotPast,
            dotState === 'current' && styles.dotCurrent,
            dotState === 'future' && styles.dotFuture,
          ]}
        >
          {dotState === 'past' && <Text style={styles.checkGlyph}>✓</Text>}
        </View>

        {/* Connector line */}
        {!isLast && (
          <View
            style={[styles.connector, { backgroundColor: connectorColor }]}
          />
        )}
      </View>

      <View style={styles.contentColumn}>
        <Text
          style={[
            styles.label,
            dotState === 'current' && styles.labelCurrent,
            dotState === 'future' && styles.labelFuture,
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.description,
            dotState === 'future' && styles.descriptionFuture,
          ]}
        >
          {description}
        </Text>
        {time && (
          <Text style={styles.time}>{formatRelativeTime(time)}</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  row: { flexDirection: 'row', minHeight: 60 },
  dotColumn: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: UI_COLORS.sage,
    zIndex: 0,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_COLORS.card,
    zIndex: 1,
  },
  dotPast: {
    backgroundColor: UI_COLORS.sage,
    borderColor: UI_COLORS.sage,
  },
  dotCurrent: {
    backgroundColor: UI_COLORS.sage,
    borderColor: UI_COLORS.sage,
  },
  dotFuture: { borderColor: UI_COLORS.border },
  checkGlyph: { fontSize: 12, color: '#FFFFFF', fontWeight: '700' },
  connector: {
    width: 2,
    flex: 1,
    marginVertical: 2,
    minHeight: 32,
  },
  contentColumn: { flex: 1, marginLeft: 12, paddingBottom: 14 },
  label: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text },
  labelCurrent: { color: UI_COLORS.sage },
  labelFuture: { color: UI_COLORS.muted },
  description: {
    fontSize: 12,
    color: UI_COLORS.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  descriptionFuture: { color: UI_COLORS.muted, opacity: 0.7 },
  time: { fontSize: 11, color: UI_COLORS.sage, marginTop: 4, fontWeight: '600' },
  alternativeBranch: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.borderLight,
  },
  altDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altGlyph: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  altLabel: { fontSize: 14, fontWeight: '700' },
  altDescription: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
})
