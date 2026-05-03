import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import { UI_COLORS } from '../ui/primitives'
import { formatCOPCompact } from '../../utils/format'

/**
 * EarningsBarChart — gráfico de barras vertical sin libs externas.
 *
 * Features:
 *  - Cada barra escala su altura proporcional al máximo del dataset
 *  - Animación de "subida" suave al montar (scaleY desde 0 a 1)
 *  - El último bar (más reciente) se renderiza en gold; el resto en sage
 *  - Tap en una barra muestra el valor exacto (callback `onBarPress`)
 *  - Highlight del valor seleccionado (zoomed bar)
 *
 * Data shape:
 *  - `data`: lista de barras con `{ label, value, period }`
 *  - El componente es agnóstico al dominio (sirve para earnings, citas, etc.)
 *
 * Migración futura: cuando se necesite tooltips ricos, animaciones complejas
 * o múltiples series, migrar a Victory Native o react-native-svg-charts.
 */

export interface BarData {
  /** Label corto (ej. "may") */
  label: string
  /** Valor numérico */
  value: number
  /** Identifier opcional para callbacks */
  period?: string
}

interface Props {
  data: BarData[]
  /** Color de la última barra (la más reciente). Default: gold */
  highlightColor?: string
  /** Color de las demás barras. Default: sage */
  barColor?: string
  /** Altura del gráfico en dp */
  height?: number
  /** Callback al tap */
  onBarPress?: (bar: BarData, index: number) => void
  /** Format helper para los valores */
  formatValue?: (value: number) => string
}

export default function EarningsBarChart({
  data,
  highlightColor = UI_COLORS.gold,
  barColor = UI_COLORS.sage,
  height = 160,
  onBarPress,
  formatValue = formatCOPCompact,
}: Props) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const animations = useRef(data.map(() => new Animated.Value(0))).current

  useEffect(() => {
    Animated.stagger(
      80,
      animations.map((a) =>
        Animated.timing(a, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // height animation requires layout
        }),
      ),
    ).start()
  }, [animations])

  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>Sin datos para mostrar</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={[styles.chartArea, { height }]}>
        {data.map((bar, idx) => {
          const isLast = idx === data.length - 1
          const ratio = bar.value / max
          const animatedHeight = animations[idx].interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', `${ratio * 100}%`],
          })
          const color = isLast ? highlightColor : barColor

          return (
            <View key={`${bar.period ?? bar.label}-${idx}`} style={styles.barColumn}>
              {/* Valor encima de la barra */}
              <Text
                style={[
                  styles.valueLabel,
                  isLast && { color: highlightColor, fontWeight: '800' },
                ]}
                accessibilityLabel={`${bar.label}: ${formatValue(bar.value)}`}
              >
                {formatValue(bar.value)}
              </Text>

              {/* Barra animada */}
              <View style={styles.barTrack}>
                <Animated.View
                  style={[
                    styles.bar,
                    {
                      height: animatedHeight,
                      backgroundColor: color,
                    },
                  ]}
                  onTouchEnd={() => onBarPress?.(bar, idx)}
                />
              </View>

              {/* Label del periodo */}
              <Text
                style={[
                  styles.periodLabel,
                  isLast && { color: highlightColor, fontWeight: '700' },
                ]}
              >
                {bar.label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 22,
    paddingBottom: 24,
    gap: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    position: 'relative',
  },
  valueLabel: {
    fontSize: 10,
    color: UI_COLORS.muted,
    fontWeight: '600',
    marginBottom: 4,
    position: 'absolute',
    top: -2,
  },
  barTrack: {
    width: '70%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 2,
  },
  periodLabel: {
    fontSize: 11,
    color: UI_COLORS.muted,
    marginTop: 6,
    position: 'absolute',
    bottom: -22,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 13, color: UI_COLORS.muted },
})
