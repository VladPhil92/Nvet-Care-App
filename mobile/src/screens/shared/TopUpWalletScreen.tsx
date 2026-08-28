import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Button,
  Badge,
  UI_COLORS,
} from '../../components/ui/primitives'
import {
  useBalanceQuery,
  useCtgRateQuery,
} from '../../hooks/queries/useMobileQueries'
import { formatCOP, formatCTG } from '../../utils/format'

/**
 * TopUpWalletScreen — recarga de saldo CTG.
 *
 * Capacidades:
 *  - Hero card con saldo CTG actual
 *  - Quick amounts: $50.000 / $100.000 / $200.000 / $500.000
 *  - Input personalizado de monto COP
 *  - Conversión automática COP → CTG en tiempo real (con `useCtgRateQuery`)
 *  - Selector de método (PSE / TRANSFER)
 *  - Botón "Continuar al pago" → redirige a flujo de PSE/transfer
 *
 * Decisión: el método CTG no aparece como opción (no se puede recargar CTG con CTG).
 * El backend genera una transacción de tipo DEPOSIT cuando se confirme el pago.
 */

interface Props {
  navigation: any
}

const QUICK_AMOUNTS_COP = [50_000, 100_000, 200_000, 500_000]
const MIN_AMOUNT = 20_000

const PSE_BANKS = [
  { code: '1007', name: 'Bancolombia' },
  { code: '1023', name: 'Banco de Bogotá' },
  { code: '1062', name: 'Banco Popular' },
  { code: '1069', name: 'Banco Falabella' },
  { code: '1037', name: 'BBVA' },
  { code: '1006', name: 'Banco Davivienda' },
  { code: '1060', name: 'Banco Pichincha' },
  { code: '1052', name: 'Nequi' },
  { code: '1551', name: 'Daviplata' },
  { code: '1289', name: 'Scotiabank Colpatria' },
]

const TRANSFER_ACCOUNT = {
  bank: 'Bancolombia',
  accountType: 'Cuenta de Ahorros',
  accountNumber: '123-456789-01',
  owner: 'CTG One Corporation S.A.S.',
  nit: '901.234.567-8',
  email: 'pagos@nvetcare.com',
}

export default function TopUpWalletScreen({ navigation }: Props) {
  const balanceQuery = useBalanceQuery()
  const ctgRateQuery = useCtgRateQuery()

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'PSE' | 'TRANSFER'>('PSE')
  const [selectedBank, setSelectedBank] = useState<typeof PSE_BANKS[0] | null>(null)
  const [showBankSheet, setShowBankSheet] = useState(false)
  const [showTransferDetails, setShowTransferDetails] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const ctgRate = ctgRateQuery.data?.rate ?? 0
  const amountNum = parseInt(amount.replace(/[^\d]/g, ''), 10) || 0
  const ctgEquivalent = useMemo(
    () => (ctgRate > 0 ? amountNum / ctgRate : 0),
    [amountNum, ctgRate],
  )

  const handleCopyAccount = useCallback((value: string) => {
    Clipboard.setString(value)
    Alert.alert('Copiado', 'Número de cuenta copiado al portapapeles.')
  }, [])

  const handleSubmit = useCallback(() => {
    const errs: Record<string, string> = {}
    if (amountNum < MIN_AMOUNT) {
      errs.amount = `Monto mínimo: ${formatCOP(MIN_AMOUNT)}`
    } else if (amountNum > 5_000_000) {
      errs.amount = `Monto máximo: ${formatCOP(5_000_000)}`
    }
    if (method === 'PSE' && !selectedBank) {
      errs.bank = 'Selecciona tu banco para continuar'
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    if (method === 'TRANSFER') {
      setShowTransferDetails(true)
    } else {
      // PSE: mostrar confirmación antes de redirigir al portal
      Alert.alert(
        `Pago PSE · ${formatCOP(amountNum)}`,
        `Serás redirigido al portal de ${selectedBank!.name} para autorizar el débito. El saldo se acreditará automáticamente al confirmar.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Ir al portal PSE',
            onPress: () => {
              // En producción: abrir paymentUrl del backend
              Alert.alert(
                'Portal PSE',
                'En producción este botón abre la URL de pago generada por el backend. Integra POST /payments/deposits cuando el modelo de datos soporte depósitos independientes.',
                [{ text: 'Entendido', onPress: () => navigation.goBack() }],
              )
            },
          },
        ],
      )
    }
  }, [amountNum, method, selectedBank, navigation])

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
        <Text style={styles.title}>Recargar billetera</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* Saldo actual */}
          <Card variant="elevated" style={styles.heroCard}>
            <Text style={styles.heroLabel}>SALDO ACTUAL</Text>
            <Text style={styles.heroAmount}>
              {formatCTG(balanceQuery.data?.ctgBalance ?? 0)}
            </Text>
          </Card>

          {/* Amount */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>¿Cuánto quieres recargar?</Text>
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

            {ctgRate > 0 && amountNum > 0 && (
              <View style={styles.conversionBox}>
                <Text style={styles.conversionLabel}>Recibirás</Text>
                <Text style={styles.conversionAmount}>
                  ≈ {formatCTG(ctgEquivalent)}
                </Text>
                <Text style={styles.conversionRate}>
                  Tasa: 1 CTG = {formatCOP(ctgRate)}
                </Text>
              </View>
            )}

            <View style={styles.quickRow}>
              {QUICK_AMOUNTS_COP.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => setAmount(String(q))}
                  style={[
                    styles.quickChip,
                    amountNum === q && styles.quickChipSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Monto: ${formatCOP(q)}`}
                >
                  <Text
                    style={[
                      styles.quickValue,
                      amountNum === q && styles.quickValueSelected,
                    ]}
                  >
                    {formatCOP(q)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.helper}>
              Mínimo: {formatCOP(MIN_AMOUNT)} · Máximo: {formatCOP(5_000_000)}
            </Text>
          </View>

          {/* Method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Método de pago</Text>
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => setMethod('PSE')}
                style={[
                  styles.methodCard,
                  method === 'PSE' && styles.methodCardSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === 'PSE' }}
              >
                <Text style={styles.methodGlyph}>🏦</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text style={styles.methodLabel}>PSE</Text>
                    <Badge label="Instantáneo" tone="success" outline size="sm" />
                  </View>
                  <Text style={styles.methodSubtitle}>
                    Débito directo desde tu banco colombiano
                  </Text>
                </View>
                <View style={[styles.radio, method === 'PSE' && styles.radioSelected]}>
                  {method === 'PSE' && <View style={styles.radioDot} />}
                </View>
              </Pressable>

              <Pressable
                onPress={() => setMethod('TRANSFER')}
                style={[
                  styles.methodCard,
                  method === 'TRANSFER' && styles.methodCardSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === 'TRANSFER' }}
              >
                <Text style={styles.methodGlyph}>💳</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text style={styles.methodLabel}>Transferencia</Text>
                    <Badge label="Hasta 2 h" tone="warning" outline size="sm" />
                  </View>
                  <Text style={styles.methodSubtitle}>
                    Bancolombia, Nequi, Daviplata… con comprobante
                  </Text>
                </View>
                <View style={[styles.radio, method === 'TRANSFER' && styles.radioSelected]}>
                  {method === 'TRANSFER' && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            </View>
          </View>

          {/* PSE bank selector */}
          {method === 'PSE' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tu banco</Text>
              <Pressable
                onPress={() => setShowBankSheet(true)}
                style={[styles.bankPicker, errors.bank && styles.inputError]}
                accessibilityRole="button"
                accessibilityLabel="Seleccionar banco PSE"
              >
                <Text style={selectedBank ? styles.bankPickerValue : styles.bankPickerPlaceholder}>
                  {selectedBank?.name ?? 'Selecciona tu banco…'}
                </Text>
                <Text style={styles.bankPickerChevron}>›</Text>
              </Pressable>
              {errors.bank && <Text style={styles.errorText}>{errors.bank}</Text>}
            </View>
          )}

          <View style={{ marginTop: 24 }}>
            <Button
              label={`Continuar al pago${amountNum > 0 ? ' · ' + formatCOP(amountNum) : ''}`}
              onPress={handleSubmit}
              disabled={amountNum <= 0}
              fullWidth
            />
          </View>

          <Text style={styles.disclaimer}>
            Las recargas se acreditan automáticamente al confirmar el pago. La
            tasa CTG se actualiza cada 5 minutos.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* PSE bank selector sheet */}
      <Modal
        visible={showBankSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBankSheet(false)}
      >
        <SafeAreaView style={styles.sheetSafe}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Selecciona tu banco</Text>
            <Pressable onPress={() => setShowBankSheet(false)} hitSlop={12}>
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView>
            {PSE_BANKS.map((bank) => (
              <Pressable
                key={bank.code}
                style={[
                  styles.bankRow,
                  selectedBank?.code === bank.code && styles.bankRowSelected,
                ]}
                onPress={() => {
                  setSelectedBank(bank)
                  setErrors((e) => ({ ...e, bank: '' }))
                  setShowBankSheet(false)
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedBank?.code === bank.code }}
              >
                <Text style={styles.bankName}>{bank.name}</Text>
                {selectedBank?.code === bank.code && (
                  <Text style={styles.bankCheck}>✓</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Transfer account details sheet */}
      <Modal
        visible={showTransferDetails}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTransferDetails(false)}
      >
        <SafeAreaView style={styles.sheetSafe}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Datos para la transferencia</Text>
            <Pressable onPress={() => setShowTransferDetails(false)} hitSlop={12}>
              <Text style={styles.sheetClose}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.transferContent}>
            <View style={styles.amountTag}>
              <Text style={styles.amountTagLabel}>MONTO A TRANSFERIR</Text>
              <Text style={styles.amountTagValue}>{formatCOP(amountNum)}</Text>
            </View>

            {[
              { label: 'Banco', value: TRANSFER_ACCOUNT.bank },
              { label: 'Tipo de cuenta', value: TRANSFER_ACCOUNT.accountType },
              { label: 'Número de cuenta', value: TRANSFER_ACCOUNT.accountNumber, copy: true },
              { label: 'Titular', value: TRANSFER_ACCOUNT.owner },
              { label: 'NIT', value: TRANSFER_ACCOUNT.nit, copy: true },
              { label: 'Email de confirmación', value: TRANSFER_ACCOUNT.email, copy: true },
            ].map(({ label, value, copy }) => (
              <View key={label} style={styles.transferRow}>
                <Text style={styles.transferLabel}>{label}</Text>
                <View style={styles.transferValueWrap}>
                  <Text style={styles.transferValue} selectable>{value}</Text>
                  {copy && (
                    <Pressable onPress={() => handleCopyAccount(value)} hitSlop={8}>
                      <Text style={styles.copyIcon}>📋</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}

            <View style={styles.transferNote}>
              <Text style={styles.transferNoteText}>
                📝 Después de realizar la transferencia, envía el comprobante a {TRANSFER_ACCOUNT.email} con tu número de celular registrado. El saldo se acreditará en 1-2 horas hábiles.
              </Text>
            </View>

            <Pressable
              style={styles.transferDoneBtn}
              onPress={() => {
                setShowTransferDetails(false)
                navigation.goBack()
              }}
              accessibilityRole="button"
            >
              <Text style={styles.transferDoneBtnText}>Entendido, haré la transferencia</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
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
  back: { fontSize: 28, color: UI_COLORS.sage },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  content: { padding: 16, paddingBottom: 40 },
  heroCard: {
    backgroundColor: '#1F2A1B',
    borderColor: 'transparent',
    alignItems: 'center',
    paddingVertical: 20,
  },
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
  inputError: { borderColor: UI_COLORS.error },
  errorText: { fontSize: 11, color: UI_COLORS.error, marginTop: 4 },
  helper: {
    fontSize: 11,
    color: UI_COLORS.muted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  conversionBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#5B75530a',
    borderRadius: 10,
    alignItems: 'center',
  },
  conversionLabel: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  conversionAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: UI_COLORS.sage,
    marginTop: 4,
  },
  conversionRate: {
    fontSize: 11,
    color: UI_COLORS.muted,
    marginTop: 4,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 16,
  },
  quickChip: {
    flex: 1,
    minWidth: 80,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: UI_COLORS.card,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    alignItems: 'center',
  },
  quickChipSelected: {
    borderColor: UI_COLORS.sage,
    backgroundColor: '#5B75530a',
  },
  quickValue: { fontSize: 13, fontWeight: '700', color: UI_COLORS.text },
  quickValueSelected: { color: UI_COLORS.sage },
  // Method
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
    borderColor: UI_COLORS.sage,
    backgroundColor: '#5B75530a',
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
  radioSelected: { borderColor: UI_COLORS.sage },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI_COLORS.sage,
  },
  disclaimer: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },
  // PSE bank picker
  bankPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: UI_COLORS.card,
  },
  bankPickerValue: { fontSize: 15, color: UI_COLORS.text, fontWeight: '600' },
  bankPickerPlaceholder: { fontSize: 15, color: UI_COLORS.muted },
  bankPickerChevron: { fontSize: 20, color: UI_COLORS.muted },
  // Sheet common
  sheetSafe: { flex: 1, backgroundColor: UI_COLORS.bg },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  sheetClose: { fontSize: 18, color: UI_COLORS.muted },
  // Bank list
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  bankRowSelected: { backgroundColor: '#5B75530a' },
  bankName: { fontSize: 15, color: UI_COLORS.text },
  bankCheck: { fontSize: 16, color: UI_COLORS.sage, fontWeight: '700' },
  // Transfer details sheet
  transferContent: { padding: 20, gap: 0 },
  amountTag: {
    backgroundColor: '#1F2A1B',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  amountTagLabel: {
    fontSize: 10,
    color: UI_COLORS.muted,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  amountTagValue: {
    fontSize: 30,
    fontWeight: '800',
    color: UI_COLORS.gold,
    marginTop: 6,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    gap: 8,
  },
  transferLabel: {
    fontSize: 12,
    color: UI_COLORS.muted,
    fontWeight: '600',
    flex: 0.4,
  },
  transferValueWrap: {
    flex: 0.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  transferValue: {
    fontSize: 14,
    color: UI_COLORS.text,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  copyIcon: { fontSize: 16 },
  transferNote: {
    backgroundColor: '#5B75530a',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
  },
  transferNoteText: {
    fontSize: 13,
    color: UI_COLORS.text,
    lineHeight: 18,
  },
  transferDoneBtn: {
    backgroundColor: UI_COLORS.sage,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  transferDoneBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})
