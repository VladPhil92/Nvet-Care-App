import React, { useState, useCallback } from 'react'
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
import {
  Card,
  Button,
  Badge,
  UI_COLORS,
} from '../../components/ui/primitives'
import DocumentPickerCard, {
  PickedDocument,
} from '../../components/common/DocumentPickerCard'
import { useVerifyTransferMutation } from '../../hooks/queries/useMobileMutations'
import { pickImage } from '../../utils/imagePicker'

/**
 * TransferVerificationScreen — pantalla del vet para subir comprobante.
 *
 * Cuando un cliente paga por TRANSFER, el vet debe subir el comprobante de la
 * transferencia recibida para confirmar el pago. La transacción pasa de
 * VERIFYING → CONFIRMED.
 *
 * Capacidades:
 *  - Image picker para el comprobante (JPG/PNG/PDF)
 *  - Input para código/referencia de la transferencia
 *  - Date picker simple (input de texto YYYY-MM-DD por simplicidad)
 *  - Validación: comprobante + código son requeridos
 */

interface Props {
  navigation: any
  route: { params: { transactionId: string } }
}

export default function TransferVerificationScreen({ navigation, route }: Props) {
  const { transactionId } = route.params

  const [proof, setProof] = useState<PickedDocument | null>(null)
  const [transferCode, setTransferCode] = useState('')
  const [transferDate, setTransferDate] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const verifyMutation = useVerifyTransferMutation()

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
        'Verificaremos la transferencia. Recibirás una notificación cuando se confirme.',
        [{ text: 'Entendido', onPress: () => navigation.goBack() }],
      )
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.response?.data?.message ||
          'No pudimos verificar la transferencia. Intenta de nuevo.',
      )
    }
  }, [proof, transferCode, transferDate, transactionId, verifyMutation, navigation])

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
        <Text style={styles.title}>Verificar transferencia</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Card variant="flat" style={styles.intro}>
            <Badge label="Por verificar" tone="warning" outline size="sm" />
            <Text style={styles.introText}>
              Sube el comprobante que recibiste y escribe el código o
              referencia de la transferencia. Validaremos los datos en minutos.
            </Text>
          </Card>

          <View style={{ marginTop: 24 }}>
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
                verifyMutation.isPending
                  ? 'Enviando…'
                  : 'Enviar comprobante'
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
    gap: 8,
  },
  back: { fontSize: 28, color: UI_COLORS.gold },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  content: { padding: 16, paddingBottom: 40 },
  intro: { gap: 8 },
  introText: { fontSize: 13, color: UI_COLORS.muted, lineHeight: 18, marginTop: 4 },
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
