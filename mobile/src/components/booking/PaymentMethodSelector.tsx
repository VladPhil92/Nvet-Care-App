import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { Badge, UI_COLORS, Skeleton } from '../ui/primitives'
import { formatCOP, formatCTG } from '../../utils/format'
import {
  useBalanceQuery,
  useCtgRateQuery,
} from '../../hooks/queries/useMobileQueries'

export type PaymentMethod = 'CTG' | 'PSE' | 'TRANSFER'

interface Props {
  amountCop: number
  selected: PaymentMethod | null
  onSelect: (method: PaymentMethod) => void
  /** Métodos visibles pero temporalmente no seleccionables. */
  disabledMethods?: PaymentMethod[]
}

interface MethodInfo {
  id: PaymentMethod
  glyph: string
  title: string
  subtitle: string
  timing: string
  timingTone: 'success' | 'sage' | 'warning'
}

const METHODS: MethodInfo[] = [
  {
    id: 'CTG',
    glyph: '◈',
    title: 'CTG Token',
    subtitle: 'Tu saldo digital, sin comisiones bancarias',
    timing: 'Instantáneo',
    timingTone: 'success',
  },
  {
    id: 'PSE',
    glyph: '🏦',
    title: 'PSE',
    subtitle: 'Débito desde tu banco colombiano',
    timing: '~30 seg',
    timingTone: 'sage',
  },
  {
    id: 'TRANSFER',
    glyph: '💳',
    title: 'Transferencia',
    subtitle: 'Bancolombia, Nequi, Davivienda… con comprobante',
    timing: 'Hasta 2 h',
    timingTone: 'warning',
  },
]

export default function PaymentMethodSelector({
  amountCop,
  selected,
  onSelect,
  disabledMethods = [],
}: Props) {
  const balanceQuery = useBalanceQuery()
  const ctgRateQuery = useCtgRateQuery()

  const ctgRate = ctgRateQuery.data?.rate ?? 0
  const ctgBalance = balanceQuery.data?.ctgBalance ?? 0
  const ctgInCop = ctgRate > 0 ? ctgBalance * ctgRate : 0
  const ctgEquivalentForPayment = ctgRate > 0 ? amountCop / ctgRate : 0
  const hasEnoughCtg = ctgInCop >= amountCop && ctgRate > 0
  const isLoadingBalance = balanceQuery.isLoading || ctgRateQuery.isLoading

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Método de pago</Text>
      <View
        style={styles.methodList}
        accessibilityRole="radiogroup"
        accessibilityLabel="Selecciona método de pago"
      >
        {METHODS.map((method) => {
          const isSelected = selected === method.id
          const isCtg = method.id === 'CTG'
          const isFeatureDisabled = disabledMethods.includes(method.id)
          const isBalanceDisabled =
            isCtg && !isLoadingBalance && !hasEnoughCtg
          const isDisabled = isFeatureDisabled || isBalanceDisabled

          return (
            <Pressable
              key={method.id}
              onPress={() => !isDisabled && onSelect(method.id)}
              disabled={isDisabled}
              style={[
                styles.methodCard,
                isSelected && styles.methodCardSelected,
                isDisabled && styles.methodCardDisabled,
              ]}
              accessibilityRole="radio"
              accessibilityState={{
                selected: isSelected,
                disabled: isDisabled,
              }}
              accessibilityLabel={`${method.title}. ${method.subtitle}. Tiempo de procesamiento ${method.timing}${
                isFeatureDisabled
                  ? '. Temporalmente no disponible'
                  : isBalanceDisabled
                    ? '. Saldo insuficiente'
                    : ''
              }`}
            >
              <View style={styles.glyphCircle}>
                <Text style={styles.glyph}>{method.glyph}</Text>
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.titleRow}>
                  <Text
                    style={[
                      styles.title,
                      isDisabled && styles.titleDisabled,
                    ]}
                  >
                    {method.title}
                  </Text>
                  <Badge
                    label={isFeatureDisabled ? 'Próximamente' : method.timing}
                    tone={isFeatureDisabled ? 'muted' : method.timingTone}
                    size="sm"
                    outline
                  />
                </View>
                <Text
                  style={[
                    styles.subtitle,
                    isDisabled && styles.subtitleDisabled,
                  ]}
                  numberOfLines={2}
                >
                  {method.subtitle}
                </Text>

                {isFeatureDisabled && (
                  <Text style={styles.unavailableNote}>
                    Integración de producción en validación.
                  </Text>
                )}

                {isCtg && !isFeatureDisabled && (
                  <View style={styles.balanceRow}>
                    {isLoadingBalance ? (
                      <Skeleton width={140} height={12} />
                    ) : (
                      <>
                        <Text
                          style={[
                            styles.balanceText,
                            !hasEnoughCtg && styles.balanceInsufficient,
                          ]}
                        >
                          Saldo: {formatCTG(ctgBalance)}
                          {ctgRate > 0 && ` (≈ ${formatCOP(ctgInCop)})`}
                        </Text>
                        {hasEnoughCtg && (
                          <Text style={styles.deductionNote}>
                            Se debitará ≈ {formatCTG(ctgEquivalentForPayment)}
                          </Text>
                        )}
                        {!hasEnoughCtg && (
                          <Text style={styles.balanceInsufficientNote}>
                            Saldo insuficiente — recarga tu billetera
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>

              <View
                style={[
                  styles.radio,
                  isSelected && styles.radioSelected,
                  isDisabled && styles.radioDisabled,
                ]}
              >
                {isSelected && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 10,
  },
  methodList: { gap: 10 },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  methodCardSelected: {
    borderColor: UI_COLORS.sage,
    backgroundColor: '#5B75530a',
  },
  methodCardDisabled: { opacity: 0.55 },
  glyphCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#5B75531a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { fontSize: 22, color: UI_COLORS.sage },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: { fontSize: 15, fontWeight: '700', color: UI_COLORS.text, flex: 1 },
  titleDisabled: { color: UI_COLORS.muted },
  subtitle: { fontSize: 12, color: UI_COLORS.muted, lineHeight: 16 },
  subtitleDisabled: { color: UI_COLORS.muted },
  unavailableNote: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontStyle: 'italic',
    marginTop: 5,
  },
  balanceRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.borderLight,
    gap: 2,
  },
  balanceText: {
    fontSize: 12,
    color: UI_COLORS.sage,
    fontWeight: '600',
  },
  balanceInsufficient: { color: UI_COLORS.error },
  balanceInsufficientNote: {
    fontSize: 11,
    color: UI_COLORS.error,
    fontStyle: 'italic',
  },
  deductionNote: {
    fontSize: 11,
    color: UI_COLORS.muted,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  radioSelected: { borderColor: UI_COLORS.sage },
  radioDisabled: { borderColor: UI_COLORS.borderLight },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI_COLORS.sage,
  },
})
