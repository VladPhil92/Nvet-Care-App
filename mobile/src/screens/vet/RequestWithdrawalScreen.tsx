import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Button, UI_COLORS } from '../../components/ui/primitives'
import {
  useEarningsQuery,
  useBalanceQuery,
} from '../../hooks/queries/useMobileQueries'
import { useRequestWithdrawalMutation } from '../../hooks/queries/useMobileMutations'
import { formatCOP } from '../../utils/format'

/**
 * RequestWithdrawalScreen — flujo de retiro de saldo del vet.
 * El documento del titular se solicita siempre porque el contrato del backend
 * lo usa para validar la titularidad del destino del retiro.
 */

interface Props {
  navigation: any
}

type WithdrawalMethod = 'BANK_TRANSFER' | 'NEQUI' | 'DAVIPLATA'

const COL_BANKS = [
  'Bancolombia',
  'Davivienda',
  'BBVA',
  'Banco de Bogotá',
  'AV Villas',
  'Banco Caja Social',
  'Banco Popular',
  'Itaú',
  'Otro',
]

const MIN_WITHDRAWAL_COP = 50_000

export default function RequestWithdrawalScreen({ navigation }: Props) {
  const earningsQuery = useEarningsQuery()
  const balanceQuery = useBalanceQuery()
  const withdrawMutation = useRequestWithdrawalMutation()

  const available = earningsQuery.data?.availableBalance ?? balanceQuery.data?.copBalance ?? 0

  const [method, setMethod] = useState<WithdrawalMethod>('BANK_TRANSFER')
  const [amount, setAmount] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [bankName, setBankName] = useState('Bancolombia')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountType, setAccountType] = useState<'SAVINGS' | 'CHECKING'>('SAVINGS')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const amountNum = parseInt(amount.replace(/[^\d]/g, ''), 10) || 0

  const quickAmounts = useMemo(
    () => [
      { label: '25%', value: Math.floor(available * 0.25) },
      { label: '50%', value: Math.floor(available * 0.5) },
      { label: '75%', value: Math.floor(available * 0.75) },
      { label: 'Todo', value: available },
    ],
    [available],
  )

  const handleSubmit = useCallback(async () => {
    const errs: Record<string, string> = {}

    if (amountNum < MIN_WITHDRAWAL_COP) {
      errs.amount = `Monto mínimo: ${formatCOP(MIN_WITHDRAWAL_COP)}`
    } else if (amountNum > available) {
      errs.amount = `Monto máximo: ${formatCOP(available)}`
    }

    const normalizedDocumentId = documentId.trim()
    if (normalizedDocumentId.length < 6 || normalizedDocumentId.length > 20) {
      errs.documentId = 'Documento inválido (6-20 caracteres)'
    }

    if (method === 'BANK_TRANSFER') {
      if (!accountNumber.match(/^\d{6,16}$/)) {
        errs.accountNumber = 'Número de cuenta inválido (6-16 dígitos)'
      }
    } else if (!phoneNumber.match(/^3\d{9}$/)) {
      errs.phoneNumber = 'Número celular inválido (10 dígitos, debe empezar en 3)'
    }

    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      await withdrawMutation.mutateAsync({
        amountCop: amountNum,
        paymentMethod: method,
        accountInfo:
          method === 'BANK_TRANSFER'
            ? {
                bankName,
                accountNumber,
                accountType,
                documentId: normalizedDocumentId,
              }
            : {
                phoneNumber,
                documentId: normalizedDocumentId,
              },
      })
      Alert.alert(
        'Retiro solicitado',
        `Tu retiro de ${formatCOP(amountNum)} está en proceso. Recibirás los fondos en 1-2 días hábiles.`,
        [{ text: 'Entendido', onPress: () => navigation.goBack() }],
      )
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.response?.data?.message ||
          'No pudimos procesar tu retiro. Intenta de nuevo.',
      )
    }
  }, [
    amountNum,
    available,
    documentId,
    method,
    accountNumber,
    phoneNumber,
    bankName,
    accountType,
    withdrawMutation,
    navigation,
  ])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Solicitar retiro</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Card variant="elevated" style={styles.heroCard}>
            <Text style={styles.heroLabel}>DISPONIBLE PARA RETIRO</Text>
            <Text style={styles.heroAmount}>{formatCOP(available)}</Text>
          </Card>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monto a retirar</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="100000"
              placeholderTextColor={UI_COLORS.muted}
              style={[
                styles.amountInput,
                errors.amount && styles.inputError,
              ]}
              keyboardType="numeric"
              accessibilityLabel="Monto en pesos colombianos"
            />
            {errors.amount && (
              <Text style={styles.errorText}>{errors.amount}</Text>
            )}

            <View style={styles.quickRow}>
              {quickAmounts.map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => setAmount(String(q.value))}
                  style={styles.quickChip}
                  accessibilityRole="button"
                  accessibilityLabel={`Monto ${q.label}: ${formatCOP(q.value)}`}
                >
                  <Text style={styles.quickLabel}>{q.label}</Text>
                  <Text style={styles.quickValue}>{formatCOP(q.value)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.helper}>
              Mínimo: {formatCOP(MIN_WITHDRAWAL_COP)} · Comisión 0%
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Método de retiro</Text>
            <View style={{ gap: 8 }}>
              <MethodOption
                glyph="🏦"
                label="Transferencia bancaria"
                subtitle="A cuenta de ahorros o corriente"
                isSelected={method === 'BANK_TRANSFER'}
                onSelect={() => setMethod('BANK_TRANSFER')}
              />
              <MethodOption
                glyph="📱"
                label="Nequi"
                subtitle="A tu cuenta Nequi"
                isSelected={method === 'NEQUI'}
                onSelect={() => setMethod('NEQUI')}
              />
              <MethodOption
                glyph="📲"
                label="Daviplata"
                subtitle="A tu cuenta Daviplata"
                isSelected={method === 'DAVIPLATA'}
                onSelect={() => setMethod('DAVIPLATA')}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Titular del retiro</Text>
            <Text style={styles.fieldLabel}>Documento de identidad</Text>
            <TextInput
              value={documentId}
              onChangeText={setDocumentId}
              placeholder="Número de documento"
              placeholderTextColor={UI_COLORS.muted}
              style={[styles.input, errors.documentId && styles.inputError]}
              autoCapitalize="characters"
              maxLength={20}
              accessibilityLabel="Documento del titular"
            />
            {errors.documentId && (
              <Text style={styles.errorText}>{errors.documentId}</Text>
            )}
            <Text style={styles.helper}>
              Debe corresponder al titular de la cuenta o billetera de destino.
            </Text>
          </View>

          {method === 'BANK_TRANSFER' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Datos bancarios</Text>

              <Text style={styles.fieldLabel}>Banco</Text>
              <View style={styles.banksRow}>
                {COL_BANKS.map((b) => (
                  <Pressable
                    key={b}
                    onPress={() => setBankName(b)}
                    style={[
                      styles.bankChip,
                      bankName === b && styles.bankChipSelected,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: bankName === b }}
                  >
                    <Text
                      style={[
                        styles.bankChipLabel,
                        bankName === b && styles.bankChipLabelSelected,
                      ]}
                    >
                      {b}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                Tipo de cuenta
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['SAVINGS', 'CHECKING'] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setAccountType(t)}
                    style={[
                      styles.typeChip,
                      accountType === t && styles.typeChipSelected,
                    ]}
                    accessibilityRole="radio"
                  >
                    <Text
                      style={[
                        styles.typeChipLabel,
                        accountType === t && styles.typeChipLabelSelected,
                      ]}
                    >
                      {t === 'SAVINGS' ? 'Ahorros' : 'Corriente'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                Número de cuenta
              </Text>
              <TextInput
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="Ej. 12345678901"
                placeholderTextColor={UI_COLORS.muted}
                style={[
                  styles.input,
                  errors.accountNumber && styles.inputError,
                ]}
                keyboardType="numeric"
                maxLength={16}
                accessibilityLabel="Número de cuenta"
              />
              {errors.accountNumber && (
                <Text style={styles.errorText}>{errors.accountNumber}</Text>
              )}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Número de celular</Text>
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="3001234567"
                placeholderTextColor={UI_COLORS.muted}
                style={[styles.input, errors.phoneNumber && styles.inputError]}
                keyboardType="phone-pad"
                maxLength={10}
                accessibilityLabel="Número de celular"
              />
              {errors.phoneNumber && (
                <Text style={styles.errorText}>{errors.phoneNumber}</Text>
              )}
              <Text style={styles.helper}>
                Debe estar registrado a tu nombre en{' '}
                {method === 'NEQUI' ? 'Nequi' : 'Daviplata'}
              </Text>
            </View>
          )}

          <View style={{ marginTop: 24 }}>
            <Button
              label={
                withdrawMutation.isPending
                  ? 'Procesando…'
                  : `Retirar ${amountNum > 0 ? formatCOP(amountNum) : ''}`
              }
              onPress={handleSubmit}
              loading={withdrawMutation.isPending}
              disabled={amountNum <= 0}
              fullWidth
              accent="gold"
            />
          </View>

          <Text style={styles.disclaimer}>
            Los retiros se procesan en 1-2 días hábiles. No hay comisiones por
            retiro a cuentas en Colombia.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function MethodOption({
  glyph,
  label,
  subtitle,
  isSelected,
  onSelect,
}: {
  glyph: string
  label: string
  subtitle: string
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={[styles.methodCard, isSelected && styles.methodCardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${label}. ${subtitle}`}
    >
      <Text style={styles.methodGlyph}>{glyph}</Text>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.methodLabel}>{label}</Text>
        <Text style={styles.methodSubtitle}>{subtitle}</Text>
      </View>
      <View style={[styles.radio, isSelected && styles.radioSelected]}>
        {isSelected && <View style={styles.radioDot} />}
      </View>
    </Pressable>
  )
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
  back: { fontSize: 28, color: UI_COLORS.gold },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  content: { padding: 16, paddingBottom: 40 },
  heroCard: { alignItems: 'center', paddingVertical: 20 },
  heroLabel: {
    fontSize: 10,
    color: UI_COLORS.muted,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: UI_COLORS.gold,
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountInput: {
    fontSize: 28,
    fontWeight: '800',
    color: UI_COLORS.text,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    fontSize: 14,
    color: UI_COLORS.text,
  },
  inputError: { borderColor: UI_COLORS.error },
  errorText: { fontSize: 11, color: UI_COLORS.error, marginTop: 4 },
  helper: {
    fontSize: 11,
    color: UI_COLORS.muted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  quickChip: {
    flex: 1,
    minWidth: 70,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: UI_COLORS.card,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    alignItems: 'center',
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: UI_COLORS.gold,
    letterSpacing: 0.5,
  },
  quickValue: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  methodCardSelected: {
    borderColor: UI_COLORS.gold,
    backgroundColor: '#C9A9610a',
  },
  methodGlyph: { fontSize: 24 },
  methodLabel: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text },
  methodSubtitle: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: UI_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: UI_COLORS.gold },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI_COLORS.gold,
  },
  banksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bankChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  bankChipSelected: {
    backgroundColor: UI_COLORS.gold,
    borderColor: UI_COLORS.gold,
  },
  bankChipLabel: { fontSize: 12, color: UI_COLORS.text, fontWeight: '600' },
  bankChipLabelSelected: { color: '#FFFFFF' },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    alignItems: 'center',
    backgroundColor: UI_COLORS.card,
  },
  typeChipSelected: {
    borderColor: UI_COLORS.gold,
    backgroundColor: '#C9A9610a',
  },
  typeChipLabel: { fontSize: 13, color: UI_COLORS.text, fontWeight: '600' },
  typeChipLabelSelected: { color: UI_COLORS.gold, fontWeight: '700' },
  disclaimer: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
})
