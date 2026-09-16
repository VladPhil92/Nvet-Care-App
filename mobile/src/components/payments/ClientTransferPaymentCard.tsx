import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { launchImageLibrary } from 'react-native-image-picker'
import { useAppointmentDetailQuery } from '../../hooks/queries/useMobileQueries'
import paymentService, {
  type Transaction,
  type TransferDestination,
} from '../../services/payment.service'
import { formatCOP } from '../../utils/format'
import { UI_COLORS } from '../ui/primitives'

const CUSTOMER_SERVICE_WHATSAPP = '3186428218'

interface Props {
  appointmentId: string
  currentUserId?: string
  currentUserRole?: string
}

export default function ClientTransferPaymentCard({
  appointmentId,
  currentUserId,
  currentUserRole,
}: Props) {
  const appointmentQuery = useAppointmentDetailQuery(appointmentId)
  const [busy, setBusy] = useState(false)
  const [transferCode, setTransferCode] = useState('')
  const [destination, setDestination] = useState<TransferDestination | null>(null)

  const appointment = appointmentQuery.data
  const transaction = appointment?.transaction as Transaction | undefined
  const isClient =
    currentUserRole === 'CLIENT' && appointment?.clientId === currentUserId
  const isManualTransfer = appointment?.paymentMethod === 'TRANSFER'

  const status = transaction?.status
  const rejectionReason = transaction?.transferRejectionReason

  useEffect(() => {
    if (!isClient || !isManualTransfer) return
    let active = true
    paymentService
      .getTransferDestination()
      .then((value) => {
        if (active) setDestination(value)
      })
      .catch(() => {
        if (active) setDestination(null)
      })
    return () => {
      active = false
    }
  }, [isClient, isManualTransfer])

  const helperText = useMemo(() => {
    if (status === 'VERIFYING') {
      return 'Recibimos tu comprobante. Un administrador está validando la transferencia antes de confirmar el servicio.'
    }
    if (status === 'CONFIRMED' || status === 'LIQUIDATED') {
      return 'Pago validado. El servicio ya fue confirmado y el veterinario recibió la información necesaria.'
    }
    if (status === 'FAILED') {
      return `No pudimos validar la transferencia${rejectionReason ? `: ${rejectionReason}` : '.'} Contacta a Servicio al Cliente para verificar el pago.`
    }
    return 'Usa la llave Bre-B indicada abajo. Después de transferir, sube el comprobante para validación administrativa.'
  }, [rejectionReason, status])

  if (!isClient || !isManualTransfer) return null

  const initializeTransfer = async () => {
    if (!appointment || transaction) return
    setBusy(true)
    try {
      await paymentService.processPayment({
        appointmentId,
        paymentMethod: 'TRANSFER',
        amountCop: appointment.amount,
        idempotencyKey: `transfer-${appointmentId}`,
      })
      await appointmentQuery.refetch()
    } catch (error: any) {
      Alert.alert(
        'No pudimos iniciar el pago',
        error?.response?.data?.message || error?.message || 'Intenta nuevamente.',
      )
    } finally {
      setBusy(false)
    }
  }

  const submitProof = async () => {
    if (!transaction?.id) return
    if (transferCode.trim().length < 4) {
      Alert.alert(
        'Referencia requerida',
        'Escribe al menos los últimos 4 caracteres o dígitos de la referencia de la transferencia.',
      )
      return
    }

    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 1,
    })
    if (result.didCancel) return
    if (result.errorCode) {
      Alert.alert('No pudimos abrir tu galería', result.errorMessage || 'Intenta nuevamente.')
      return
    }

    const asset = result.assets?.[0]
    if (!asset?.uri) return

    setBusy(true)
    try {
      await paymentService.verifyTransfer(
        transaction.id,
        {
          uri: asset.uri,
          name: asset.fileName || `comprobante-${Date.now()}.jpg`,
          type: asset.type || 'image/jpeg',
        },
        {
          transferCode: transferCode.trim(),
          transferDate: new Date().toISOString(),
        },
      )
      setTransferCode('')
      await appointmentQuery.refetch()
      Alert.alert(
        'Comprobante enviado',
        'El pago quedó pendiente de validación administrativa. Te notificaremos cuando sea aprobado.',
      )
    } catch (error: any) {
      Alert.alert(
        'No pudimos enviar el comprobante',
        error?.response?.data?.message || error?.message || 'Intenta nuevamente.',
      )
    } finally {
      setBusy(false)
    }
  }

  const openCustomerService = () =>
    Linking.openURL(`https://wa.me/57${CUSTOMER_SERVICE_WHATSAPP}`).catch(() => {
      Alert.alert('Servicio al Cliente', `WhatsApp: ${CUSTOMER_SERVICE_WHATSAPP}`)
    })

  if (!transaction) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>PAGO DEL SERVICIO</Text>
        <Text style={styles.title}>Transferencia Bancolombia / Bre-B</Text>
        <Text style={styles.amount}>{formatCOP(appointment.amount)}</Text>
        <Text style={styles.helper}>
          Inicia el pago para visualizar los datos oficiales de transferencia dentro de este chat.
        </Text>
        <Pressable
          onPress={initializeTransfer}
          disabled={busy}
          style={[styles.primaryButton, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Proceder a pagar</Text>
          )}
        </Pressable>
      </View>
    )
  }

  const canSubmit = status === 'PENDING'
  const showDestination = status === 'PENDING'

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>PAGO DEL SERVICIO</Text>
      <Text style={styles.title}>Transferencia Bancolombia / Bre-B</Text>
      <Text style={styles.amount}>{formatCOP(transaction.amountCop)}</Text>

      {showDestination ? (
        <View style={styles.destinationBox}>
          <Text style={styles.destinationTitle}>Datos oficiales de pago</Text>
          <Text style={styles.destinationLine}>
            {destination?.bankName || 'Bancolombia / Bre-B'}
          </Text>
          {destination?.accountHolder ? (
            <Text style={styles.destinationLine}>{destination.accountHolder}</Text>
          ) : null}
          <View style={styles.keyBox}>
            <Text style={styles.keyLabel}>Llave</Text>
            <Text selectable style={styles.keyValue}>
              {destination?.transferKey || '1047444344'}
            </Text>
          </View>
          {destination?.note ? (
            <Text style={styles.destinationNote}>{destination.note}</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.helper}>{helperText}</Text>

      {canSubmit ? (
        <>
          <TextInput
            value={transferCode}
            onChangeText={setTransferCode}
            placeholder="Referencia de la transferencia"
            placeholderTextColor={UI_COLORS.muted}
            autoCapitalize="characters"
            style={styles.input}
          />
          <Pressable
            onPress={submitProof}
            disabled={busy}
            style={[styles.primaryButton, busy && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Subir comprobante</Text>
            )}
          </Pressable>
        </>
      ) : null}

      {status === 'VERIFYING' ? (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>⏳ Pendiente de aprobación del administrador</Text>
        </View>
      ) : null}

      {status === 'CONFIRMED' || status === 'LIQUIDATED' ? (
        <View style={styles.successBadge}>
          <Text style={styles.successText}>✓ Pago aprobado · servicio confirmado</Text>
        </View>
      ) : null}

      {status === 'FAILED' ? (
        <Pressable onPress={openCustomerService} style={styles.supportButton}>
          <Text style={styles.supportText}>
            Contactar Servicio al Cliente · WhatsApp {CUSTOMER_SERVICE_WHATSAPP}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    gap: 10,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '800',
    color: UI_COLORS.sage,
  },
  title: { fontSize: 16, fontWeight: '800', color: UI_COLORS.text },
  amount: { fontSize: 24, fontWeight: '900', color: UI_COLORS.sage },
  destinationBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.bg,
    padding: 12,
    gap: 7,
  },
  destinationTitle: { fontSize: 12, color: UI_COLORS.text, fontWeight: '800' },
  destinationLine: { fontSize: 12, color: UI_COLORS.muted },
  destinationNote: { fontSize: 11, color: UI_COLORS.muted, lineHeight: 16 },
  keyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    backgroundColor: UI_COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  keyLabel: { fontSize: 12, color: UI_COLORS.muted, fontWeight: '700' },
  keyValue: { fontSize: 16, color: UI_COLORS.text, fontWeight: '800' },
  helper: { fontSize: 12, color: UI_COLORS.muted, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: UI_COLORS.text,
    backgroundColor: UI_COLORS.bg,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_COLORS.sage,
    paddingHorizontal: 14,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.55 },
  pendingBadge: {
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#DD6B201a',
  },
  pendingText: { fontSize: 12, color: UI_COLORS.warning, fontWeight: '700' },
  successBadge: {
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#2F855A1a',
  },
  successText: { fontSize: 12, color: UI_COLORS.success, fontWeight: '700' },
  supportButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: UI_COLORS.error,
  },
  supportText: {
    color: UI_COLORS.error,
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
  },
})
