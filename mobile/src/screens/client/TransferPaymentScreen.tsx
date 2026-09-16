import React, { useCallback, useState } from 'react'
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Button, Badge, UI_COLORS } from '../../components/ui/primitives'
import DocumentPickerCard, {
  PickedDocument,
} from '../../components/common/DocumentPickerCard'
import { useTransferDestinationQuery } from '../../hooks/queries/useMobileQueries'
import { useVerifyTransferMutation } from '../../hooks/queries/useMobileMutations'
import { pickImage } from '../../utils/imagePicker'
import { formatCOP } from '../../utils/format'

/**
 * TransferPaymentScreen — pantalla del cliente para pagar por transferencia
 * directa durante la fase piloto (sin pasarela PSE todavía).
 *
 * Flujo: el cliente transfiere el monto acordado a la cuenta de la empresa
 * (mostrada aquí), luego sube el comprobante + código de la transferencia.
 * Un administrador valida el comprobante y la cita queda confirmada — el
 * estado se refleja también como aviso automático en el chat de la cita.
 */

interface Props {
  navigation: any
  route: {
    params: {
      transactionId: string
      appointmentId: string
      amountCop: number
    }
  }
}

export default function TransferPaymentScreen({ navigation, route }: Props) {
  const { transactionId, appointmentId, amountCop } = route.params

  const destinationQuery = useTransferDestinationQuery()
  const verifyMutation = useVerifyTransferMutation()

  const [proof, setProof] = useState<PickedDocument | null>(null)
  const [transferCode, setTransferCode] = useState('')
  const [transferDate, setTransferDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleCopyKey = useCallback((value: string) => {
    Clipboard.setString(value)
    Alert.alert('Copiado', 'Llave copiada al portapapeles.')
  }, [])

  const handlePickProof = useCallback(async () => {
    const picked = await pickImage()
    if (picked) {
      setProof(picked)
      setErrors((prev) => ({ ...prev, proof: '' }))
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    const errs: Record<string, string> = {}
    if (!proof) errs.proof = 'El comprobante es requerido'
    if (transferCode.trim().length < 4)
      errs.transferCode = 'Código mínimo 4 caracteres'

    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    try {
      await verifyMutation.mutateAsync({
        transactionId,
        file: {
          uri: proof!.uri,
          name: proof!.name,
          type: proof!.type,
        },
        transferCode: transferCode.trim(),
        transferDate: transferDate.trim() || undefined,
      })
      Alert.alert(
        'Comprobante enviado',
        'Un administrador validará tu pago pronto. Te avisaremos por el chat de la cita en cuanto se confirme.',
        [
          {
            text: 'Ver cita',
            onPress: () =>
              navigation.replace('AppointmentDetail', { appointmentId }),
          },
        ],
      )
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.response?.data?.message ||
          'No pudimos enviar el comprobante. Intenta de nuevo.',
      )
    }
  }, [
    proof,
    transferCode,
    transferDate,
    transactionId,
    appointmentId,
    verifyMutation,
    navigation,
  ])

  const destination = destinationQuery.data

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Pagar por transferencia</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Card variant="flat" style={styles.amountCard}>
            <Text style={styles.amountLabel}>Monto a transferir</Text>
            <Text style={styles.amountValue}>{formatCOP(amountCop)}</Text>
          </Card>

          <Card variant="flat" style={styles.destinationCard}>
            <Badge label="Cuenta piloto" tone="warning" outline size="sm" />
            {destinationQuery.isLoading ? (
              <Text style={styles.introText}>Cargando datos de la cuenta…</Text>
            ) : destination ? (
              <>
                <Text style={styles.destinationLabel}>Banco</Text>
                <Text style={styles.destinationValue}>
                  {destination.bankName}
                </Text>

                <Text style={styles.destinationLabel}>Titular</Text>
                <Text style={styles.destinationValue}>
                  {destination.accountHolder}
                </Text>

                <Text style={styles.destinationLabel}>Llave</Text>
                <Pressable
                  onPress={() => handleCopyKey(destination.transferKey)}
                  style={styles.keyRow}
                  accessibilityRole="button"
                  accessibilityLabel="Copiar llave de transferencia"
                >
                  <Text style={styles.keyValue}>{destination.transferKey}</Text>
                  <Text style={styles.copyHint}>Copiar</Text>
                </Pressable>

                <Text style={styles.destinationNote}>{destination.note}</Text>
              </>
            ) : (
              <Text style={styles.introText}>
                No pudimos cargar los datos de la cuenta. Intenta de nuevo.
              </Text>
            )}
          </Card>

          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionTitle}>Ya transferí, subo mi comprobante</Text>
            <DocumentPickerCard
              label="Comprobante de la transferencia"
              description="JPG, PNG o PDF. Asegúrate de que se vean el monto, fecha y código."
              required
              glyph="🧾"
              document={proof}
              onPick={handlePickProof}
              onRemove={() => setProof(null)}
              error={errors.proof}
            />
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={styles.fieldLabel}>Código o referencia</Text>
            <TextInput
              value={transferCode}
              onChangeText={setTransferCode}
              placeholder="Ej. 87654321"
              placeholderTextColor={UI_COLORS.muted}
              style={[styles.input, errors.transferCode && styles.inputError]}
              autoCapitalize="characters"
              accessibilityLabel="Código de la transferencia"
            />
            {errors.transferCode && (
              <Text style={styles.errorText}>{errors.transferCode}</Text>
            )}
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={styles.fieldLabel}>
              Fecha de la transferencia (opcional)
            </Text>
            <TextInput
              value={transferDate}
              onChangeText={setTransferDate}
              placeholder="2026-04-30"
              placeholderTextColor={UI_COLORS.muted}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              accessibilityLabel="Fecha de la transferencia (YYYY-MM-DD)"
            />
            <Text style={styles.helper}>Formato: YYYY-MM-DD</Text>
          </View>

          <View style={{ marginTop: 24 }}>
            <Button
              label={
                verifyMutation.isPending ? 'Enviando…' : 'Enviar comprobante'
              }
              onPress={handleSubmit}
              loading={verifyMutation.isPending}
              fullWidth
              accent="gold"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  content: { padding: 16, paddingBottom: 40 },
  amountCard: { alignItems: 'center', gap: 4 },
  amountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountValue: { fontSize: 28, fontWeight: '800', color: UI_COLORS.text },
  destinationCard: { marginTop: 16, gap: 4 },
  introText: { fontSize: 13, color: UI_COLORS.muted, lineHeight: 18, marginTop: 4 },
  destinationLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: UI_COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  destinationValue: { fontSize: 15, fontWeight: '600', color: UI_COLORS.text },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: UI_COLORS.bg,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  keyValue: { fontSize: 18, fontWeight: '800', color: UI_COLORS.text, letterSpacing: 1 },
  copyHint: { fontSize: 12, fontWeight: '700', color: UI_COLORS.gold },
  destinationNote: {
    fontSize: 12,
    color: UI_COLORS.muted,
    fontStyle: 'italic',
    marginTop: 12,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    marginTop: 4,
    fontStyle: 'italic',
  },
})
