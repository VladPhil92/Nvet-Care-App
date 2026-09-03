import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, UI_COLORS, Skeleton } from '../ui/primitives'
import { formatCOP, formatCTG } from '../../utils/format'
import {
  useBalanceQuery,
  useCtgRateQuery,
} from '../../hooks/queries/useMobileQueries'
import betaService, { type BetaLegalStatus } from '../../services/beta.service'

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

/**
 * CTG aún no tiene ledger de saldo de cliente y PSE conserva un adapter
 * sandbox. Hasta que ambos flujos tengan settlement real, se muestran como
 * próximos pero no se pueden seleccionar por defecto. TRANSFER permanece como
 * el método productizable del MVP.
 */
const DEFAULT_DISABLED_METHODS: PaymentMethod[] = ['CTG', 'PSE']
const BETA_POLICY_QUERY_KEY = ['beta', 'policy'] as const
const BETA_LEGAL_QUERY_KEY = ['beta', 'legal'] as const

export default function PaymentMethodSelector({
  amountCop,
  selected,
  onSelect,
  disabledMethods = DEFAULT_DISABLED_METHODS,
}: Props) {
  const queryClient = useQueryClient()
  const balanceQuery = useBalanceQuery()
  const ctgRateQuery = useCtgRateQuery()
  const policyQuery = useQuery({
    queryKey: BETA_POLICY_QUERY_KEY,
    queryFn: () => betaService.getPolicy(),
    staleTime: 60_000,
    retry: 1,
  })
  const betaMode = policyQuery.data?.mode === 'closed-beta'
  const legalQuery = useQuery({
    queryKey: BETA_LEGAL_QUERY_KEY,
    queryFn: () => betaService.getLegalStatus(),
    enabled: betaMode,
    staleTime: 0,
    retry: 1,
  })
  const acceptLegalMutation = useMutation({
    mutationFn: async () => {
      const current = legalQuery.data
      if (!current) throw new Error('No pudimos cargar la versión legal vigente.')
      return betaService.acceptLegal({
        termsVersion: current.terms.version,
        privacyVersion: current.privacy.version,
      })
    },
    onSuccess: (status: BetaLegalStatus) => {
      queryClient.setQueryData(BETA_LEGAL_QUERY_KEY, status)
    },
  })

  const ctgRate = ctgRateQuery.data?.rate ?? 0
  const ctgBalance = balanceQuery.data?.ctgBalance ?? 0
  const ctgInCop = ctgRate > 0 ? ctgBalance * ctgRate : 0
  const ctgEquivalentForPayment = ctgRate > 0 ? amountCop / ctgRate : 0
  const hasEnoughCtg = ctgInCop >= amountCop && ctgRate > 0
  const isLoadingBalance = balanceQuery.isLoading || ctgRateQuery.isLoading
  const legalAccepted = legalQuery.data?.accepted === true
  const betaConsentBlocking =
    policyQuery.isLoading ||
    policyQuery.isError ||
    (betaMode &&
      (legalQuery.isLoading ||
        legalQuery.isError ||
        !legalAccepted ||
        acceptLegalMutation.isPending))

  const retryBetaStatus = () => {
    if (policyQuery.isError) {
      void policyQuery.refetch()
      return
    }
    void legalQuery.refetch()
  }

  return (
    <View style={styles.container}>
      <BetaConsentGate
        betaMode={betaMode}
        policyLoading={policyQuery.isLoading}
        policyError={policyQuery.isError}
        legalLoading={legalQuery.isLoading}
        legalError={legalQuery.isError}
        legalStatus={legalQuery.data}
        accepting={acceptLegalMutation.isPending}
        acceptError={acceptLegalMutation.isError}
        onAccept={() => acceptLegalMutation.mutate()}
        onRetry={retryBetaStatus}
      />

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
          const isBalanceDisabled = isCtg && !isLoadingBalance && !hasEnoughCtg
          const isDisabled =
            betaConsentBlocking || isFeatureDisabled || isBalanceDisabled

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
                betaConsentBlocking
                  ? '. Debes completar la validación de participación beta antes de seleccionar un medio de pago'
                  : isFeatureDisabled
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

interface BetaConsentGateProps {
  betaMode: boolean
  policyLoading: boolean
  policyError: boolean
  legalLoading: boolean
  legalError: boolean
  legalStatus?: BetaLegalStatus
  accepting: boolean
  acceptError: boolean
  onAccept: () => void
  onRetry: () => void
}

function BetaConsentGate({
  betaMode,
  policyLoading,
  policyError,
  legalLoading,
  legalError,
  legalStatus,
  accepting,
  acceptError,
  onAccept,
  onRetry,
}: BetaConsentGateProps) {
  if (policyLoading) {
    return (
      <View style={styles.betaCard} accessibilityLiveRegion="polite">
        <Skeleton width="55%" height={16} />
        <View style={{ height: 8 }} />
        <Skeleton width="100%" height={12} />
        <View style={{ height: 6 }} />
        <Skeleton width="82%" height={12} />
      </View>
    )
  }

  if (policyError || (betaMode && legalError)) {
    return (
      <View style={[styles.betaCard, styles.betaCardError]} accessibilityLiveRegion="polite">
        <Text style={styles.betaTitle}>No pudimos validar tu participación beta</Text>
        <Text style={styles.betaBody}>
          Por seguridad, los métodos de pago permanecerán bloqueados hasta verificar
          la política y el consentimiento vigentes.
        </Text>
        <Pressable
          onPress={onRetry}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Reintentar validación beta"
        >
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  if (!betaMode) return null

  if (legalLoading || !legalStatus) {
    return (
      <View style={styles.betaCard} accessibilityLiveRegion="polite">
        <Badge label="Beta Cartagena" tone="sage" outline size="sm" />
        <Text style={styles.betaBody}>Verificando consentimiento vigente…</Text>
      </View>
    )
  }

  if (legalStatus.accepted) {
    return (
      <View style={styles.betaAcceptedCard} accessibilityLiveRegion="polite">
        <Badge label="Beta Cartagena" tone="success" outline size="sm" />
        <View style={{ flex: 1 }}>
          <Text style={styles.betaAcceptedTitle}>Consentimiento vigente</Text>
          <Text style={styles.betaAcceptedBody}>
            Puedes continuar con la reserva. Si la versión legal cambia, volveremos a
            pedir tu aceptación antes de una nueva cita.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.betaCard} accessibilityLiveRegion="polite">
      <Badge label="Beta Cerrada Cartagena" tone="sage" outline size="sm" />
      <Text style={styles.betaTitle}>Confirma tu participación antes de pagar</Text>
      <Text style={styles.betaBody}>
        Nvet Care está operando este flujo como una beta cerrada y controlada en
        Cartagena. Antes de reservar debes aceptar expresamente los términos y el
        aviso de privacidad vigentes.
      </Text>

      <View style={styles.betaSummary}>
        <Text style={styles.betaSummaryItem}>
          • Nvet Care coordina el servicio; las decisiones clínicas corresponden al
          veterinario responsable.
        </Text>
        <Text style={styles.betaSummaryItem}>
          • La beta no debe usarse como único canal ante una emergencia veterinaria.
        </Text>
        <Text style={styles.betaSummaryItem}>
          • Nuevas reservas pueden detenerse temporalmente por seguridad, pagos o
          continuidad sin eliminar tu historial.
        </Text>
        <Text style={styles.betaSummaryItem}>
          • Si cambian las versiones legales, tendrás que aceptarlas nuevamente antes
          de otra reserva.
        </Text>
      </View>

      <Text style={styles.betaVersion}>
        Vigencia: {legalStatus.effectiveAt} · Términos {legalStatus.terms.version} ·
        Privacidad {legalStatus.privacy.version}
      </Text>

      {acceptError && (
        <Text style={styles.betaErrorText}>
          No pudimos registrar tu aceptación. Revisa tu conexión e intenta de nuevo.
        </Text>
      )}

      <Button
        label={accepting ? 'Registrando aceptación…' : 'Acepto y continuar'}
        onPress={onAccept}
        loading={accepting}
        disabled={accepting}
        fullWidth
      />
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
  betaCard: {
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    gap: 10,
  },
  betaCardError: {
    borderColor: UI_COLORS.error,
  },
  betaTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: UI_COLORS.text,
  },
  betaBody: {
    fontSize: 12,
    lineHeight: 18,
    color: UI_COLORS.muted,
  },
  betaSummary: {
    gap: 6,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#5B75530a',
  },
  betaSummaryItem: {
    fontSize: 12,
    lineHeight: 17,
    color: UI_COLORS.text,
  },
  betaVersion: {
    fontSize: 10,
    lineHeight: 14,
    color: UI_COLORS.muted,
  },
  betaErrorText: {
    fontSize: 11,
    lineHeight: 16,
    color: UI_COLORS.error,
  },
  betaAcceptedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: '#5B75530a',
  },
  betaAcceptedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.text,
  },
  betaAcceptedBody: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    color: UI_COLORS.muted,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: UI_COLORS.sage,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.sage,
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
