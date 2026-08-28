import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import MapView, { Marker, Region } from 'react-native-maps'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppointmentDetailQuery } from '../../hooks/queries/useMobileQueries'
import {
  useUpdateAppointmentStatusMutation,
  useAddClinicalNotesMutation,
} from '../../hooks/queries/useMobileMutations'
import liveLocationService, { Coordinates } from '../../services/live-location.service'
import { UI_COLORS, Badge, Button, Card } from '../../components/ui/primitives'
import { formatCOP } from '../../utils/format'
import type { AppointmentStatus } from '../../services/appointment.service'

interface Props {
  navigation: any
  route: { params: { appointmentId: string } }
}

const CARTAGENA_FALLBACK: Region = {
  latitude: 10.4003,
  longitude: -75.5594,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Por confirmar',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  DISPUTED: 'En disputa',
}

const STATUS_TONES: Record<
  string,
  'sage' | 'gold' | 'success' | 'warning' | 'error' | 'info' | 'muted'
> = {
  PENDING: 'warning',
  CONFIRMED: 'gold',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'muted',
  DISPUTED: 'error',
}

interface ClinicalNotesForm {
  diagnosis: string
  treatment: string
  notes: string
}

export default function VetAppointmentDetailScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params
  const appointmentQuery = useAppointmentDetailQuery(appointmentId)
  const appointment = appointmentQuery.data
  const updateStatus = useUpdateAppointmentStatusMutation()
  const addNotes = useAddClinicalNotesMutation()

  const [location, setLocation] = useState<Coordinates | null>(null)
  const [sharing, setSharing] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [notesForm, setNotesForm] = useState<ClinicalNotesForm>({
    diagnosis: '',
    treatment: '',
    notes: '',
  })

  const status = (appointment?.status ?? 'PENDING') as AppointmentStatus
  const trackable = status === 'CONFIRMED' || status === 'IN_PROGRESS'
  const isTerminal = status === 'COMPLETED' || status === 'CANCELLED'

  useEffect(() => {
    if (!trackable) {
      setSharing(false)
      return
    }

    let watchId: number | null = null
    let active = true

    const start = async () => {
      try {
        const granted = await liveLocationService.requestPermission()
        if (!active) return
        if (!granted) {
          setLocationError('Permiso de ubicación no concedido.')
          return
        }

        setSharing(true)
        watchId = liveLocationService.watchDeviceCoordinates(
          (coords) => {
            if (!active) return
            setLocation(coords)
            setLocationError(null)
            void liveLocationService
              .publishAppointmentLiveLocation(appointmentId, coords)
              .catch(() => {
                if (active) {
                  setLocationError('No se pudo actualizar la ubicación en el servidor.')
                }
              })
          },
          (error) => {
            if (active) setLocationError(error.message)
          },
        )
      } catch (error: any) {
        if (active) {
          setLocationError(error?.message ?? 'No fue posible iniciar la ubicación.')
          setSharing(false)
        }
      }
    }

    void start()

    return () => {
      active = false
      setSharing(false)
      if (watchId !== null) liveLocationService.clearWatch(watchId)
    }
  }, [appointmentId, trackable])

  const region = useMemo<Region>(() => {
    if (!location) return CARTAGENA_FALLBACK
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    }
  }, [location])

  const handleStatusChange = useCallback(
    (next: AppointmentStatus, label: string) => {
      Alert.alert(
        label,
        `¿Confirmas cambiar el estado a "${STATUS_LABELS[next]}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Confirmar',
            onPress: () => {
              updateStatus.mutate(
                { id: appointmentId, status: next },
                {
                  onSuccess: () => appointmentQuery.refetch(),
                  onError: () =>
                    Alert.alert('Error', 'No se pudo actualizar el estado. Intenta de nuevo.'),
                },
              )
            },
          },
        ],
      )
    },
    [appointmentId, appointmentQuery, updateStatus],
  )

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancelar cita',
      'Esta acción no se puede deshacer. ¿Seguro que deseas cancelar esta cita?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => {
            updateStatus.mutate(
              { id: appointmentId, status: 'CANCELLED' },
              {
                onSuccess: () => {
                  appointmentQuery.refetch()
                  navigation.goBack()
                },
                onError: () =>
                  Alert.alert('Error', 'No se pudo cancelar la cita. Intenta de nuevo.'),
              },
            )
          },
        },
      ],
    )
  }, [appointmentId, appointmentQuery, navigation, updateStatus])

  const handleCompleteWithNotes = useCallback(() => {
    const { diagnosis, treatment } = notesForm
    if (!diagnosis.trim() || !treatment.trim()) {
      Alert.alert('Campos requeridos', 'Completa el diagnóstico y el tratamiento antes de continuar.')
      return
    }

    addNotes.mutate(
      {
        id: appointmentId,
        diagnosis: diagnosis.trim(),
        treatment: treatment.trim(),
        notes: notesForm.notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          updateStatus.mutate(
            { id: appointmentId, status: 'COMPLETED' },
            {
              onSuccess: () => {
                setShowNotesModal(false)
                appointmentQuery.refetch()
              },
              onError: () =>
                Alert.alert('Error', 'Notas guardadas, pero el estado no se actualizó. Intenta de nuevo.'),
            },
          )
        },
        onError: () =>
          Alert.alert('Error', 'No se pudieron guardar las notas clínicas.'),
      },
    )
  }, [addNotes, appointmentId, appointmentQuery, notesForm, updateStatus])

  const handleCall = useCallback(() => {
    const rawPhone =
      (appointment as any)?.client?.phone ?? (appointment as any)?.clientPhone

    if (!rawPhone) {
      Alert.alert('Sin teléfono', 'El cliente no tiene número registrado.')
      return
    }
    const url = `tel:${String(rawPhone).replace(/\s+/g, '')}`
    Linking.canOpenURL(url).then((supported) => {
      if (supported) Linking.openURL(url)
      else Alert.alert('No disponible', 'Tu dispositivo no puede realizar llamadas.')
    })
  }, [appointment])

  const handleChat = useCallback(() => {
    navigation.navigate('Chat', { appointmentId })
  }, [navigation, appointmentId])

  if (appointmentQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator color={UI_COLORS.gold} />
        </View>
      </SafeAreaView>
    )
  }

  if (!appointment) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text style={styles.errorText}>No fue posible cargar la cita.</Text>
          <Button label="Volver" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    )
  }

  const isBusy = updateStatus.isPending || addNotes.isPending

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Cita en domicilio</Text>
          <Text style={styles.headerSubtitle}>{appointment.time}</Text>
        </View>
        <Badge
          label={STATUS_LABELS[status] ?? status}
          tone={STATUS_TONES[status] ?? 'muted'}
          outline
          size="sm"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Appointment info */}
        <Card variant="flat">
          <Text style={styles.petName}>🐾 {appointment.pet?.name}</Text>
          <Text style={styles.service}>{appointment.serviceType}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {appointment.client?.firstName} {appointment.client?.lastName}
            </Text>
            {appointment.amount > 0 && (
              <Text style={styles.amount}>{formatCOP(appointment.amount)}</Text>
            )}
          </View>
          <Text style={styles.address}>{appointment.address}</Text>

          {/* Contact buttons */}
          <View style={styles.contactRow}>
            <Pressable
              onPress={handleChat}
              style={styles.contactBtn}
              accessibilityRole="button"
              accessibilityLabel="Chatear con el cliente"
            >
              <Text style={styles.contactBtnIcon}>💬</Text>
              <Text style={styles.contactBtnLabel}>Chat</Text>
            </Pressable>
            <Pressable
              onPress={handleCall}
              style={styles.contactBtn}
              accessibilityRole="button"
              accessibilityLabel="Llamar al cliente"
            >
              <Text style={styles.contactBtnIcon}>📞</Text>
              <Text style={styles.contactBtnLabel}>Llamar</Text>
            </Pressable>
          </View>
        </Card>

        {/* Clinical notes (if already completed) */}
        {status === 'COMPLETED' && appointment.clinicalNotes && (
          <Card variant="flat">
            <Text style={styles.sectionTitle}>Notas clínicas</Text>
            {appointment.diagnosis && (
              <>
                <Text style={styles.notesLabel}>Diagnóstico</Text>
                <Text style={styles.notesText}>{appointment.diagnosis}</Text>
              </>
            )}
            {appointment.treatment && (
              <>
                <Text style={styles.notesLabel}>Tratamiento</Text>
                <Text style={styles.notesText}>{appointment.treatment}</Text>
              </>
            )}
            {appointment.clinicalNotes && (
              <>
                <Text style={styles.notesLabel}>Notas adicionales</Text>
                <Text style={styles.notesText}>{appointment.clinicalNotes}</Text>
              </>
            )}
          </Card>
        )}

        {/* Live location tracking */}
        {trackable && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ubicación en vivo</Text>
              <Badge
                label={sharing ? 'Compartiendo' : 'Inactiva'}
                tone={sharing ? 'success' : 'muted'}
                size="sm"
                outline
              />
            </View>

            <View style={styles.mapCard}>
              <MapView
                style={StyleSheet.absoluteFill}
                region={region}
                showsUserLocation
                showsMyLocationButton
                showsCompass
                toolbarEnabled={false}
              >
                {location && (
                  <Marker
                    coordinate={location}
                    title="Tu ubicación"
                    description="Esta posición se comparte solo con esta cita activa"
                    pinColor="#D69B2D"
                  />
                )}
              </MapView>
            </View>

            <Card variant="flat">
              <Text style={styles.privacyTitle}>Privacidad del tracking</Text>
              <Text style={styles.privacyText}>
                La ubicación se publica únicamente mientras esta pantalla está activa y
                la cita está CONFIRMED o IN_PROGRESS. El cliente de esta cita y un
                administrador autorizado pueden consultarla.
              </Text>
            </Card>

            {locationError && (
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Ubicación',
                    `${locationError}\n\nVerifica que GPS y permisos estén habilitados.`,
                  )
                }
                style={styles.warning}
              >
                <Text style={styles.warningText}>{locationError}</Text>
              </Pressable>
            )}
          </>
        )}

        {/* Spacer for fixed action bar */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Action bar */}
      {!isTerminal && (
        <View style={styles.actionBar}>
          {status === 'PENDING' && (
            <Button
              label={isBusy ? 'Actualizando...' : 'Confirmar cita'}
              onPress={() => handleStatusChange('CONFIRMED', 'Confirmar cita')}
              disabled={isBusy}
            />
          )}

          {status === 'CONFIRMED' && (
            <View style={styles.actionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  label={isBusy ? '...' : 'Iniciar visita'}
                  onPress={() => handleStatusChange('IN_PROGRESS', 'Iniciar visita')}
                  disabled={isBusy}
                />
              </View>
              <Pressable
                onPress={handleCancel}
                disabled={isBusy}
                style={styles.cancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancelar cita"
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
            </View>
          )}

          {status === 'IN_PROGRESS' && (
            <View style={styles.actionRow}>
              <View style={{ flex: 1 }}>
                <Button
                  label={isBusy ? '...' : 'Completar cita'}
                  onPress={() => setShowNotesModal(true)}
                  disabled={isBusy}
                />
              </View>
              <Pressable
                onPress={handleCancel}
                disabled={isBusy}
                style={styles.cancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancelar cita"
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Clinical notes modal */}
      <Modal
        visible={showNotesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNotesModal(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Notas clínicas</Text>
            <Pressable
              onPress={() => setShowNotesModal(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalHint}>
              Completa el diagnóstico y tratamiento antes de marcar la cita como completada.
            </Text>

            <Text style={styles.fieldLabel}>Diagnóstico *</Text>
            <TextInput
              style={styles.textArea}
              value={notesForm.diagnosis}
              onChangeText={(v) => setNotesForm((f) => ({ ...f, diagnosis: v }))}
              placeholder="Ej: Dermatitis alérgica estacional"
              placeholderTextColor={UI_COLORS.muted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>Tratamiento *</Text>
            <TextInput
              style={styles.textArea}
              value={notesForm.treatment}
              onChangeText={(v) => setNotesForm((f) => ({ ...f, treatment: v }))}
              placeholder="Ej: Antihistamínico oral 5mg/kg por 7 días"
              placeholderTextColor={UI_COLORS.muted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>Notas adicionales</Text>
            <TextInput
              style={styles.textArea}
              value={notesForm.notes}
              onChangeText={(v) => setNotesForm((f) => ({ ...f, notes: v }))}
              placeholder="Observaciones, recomendaciones de seguimiento…"
              placeholderTextColor={UI_COLORS.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={{ marginTop: 24 }}>
              <Button
                label={isBusy ? 'Guardando...' : 'Guardar y completar cita'}
                onPress={handleCompleteWithNotes}
                disabled={isBusy || !notesForm.diagnosis.trim() || !notesForm.treatment.trim()}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI_COLORS.bg },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  errorText: { fontSize: 14, color: UI_COLORS.error, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  back: { fontSize: 32, lineHeight: 32, color: UI_COLORS.gold },
  headerTitle: { fontSize: 17, fontWeight: '800', color: UI_COLORS.text },
  headerSubtitle: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  petName: { fontSize: 18, fontWeight: '800', color: UI_COLORS.text },
  service: { fontSize: 14, fontWeight: '700', color: UI_COLORS.gold, marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  meta: { fontSize: 13, color: UI_COLORS.muted },
  amount: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text },
  address: { fontSize: 13, color: UI_COLORS.text, lineHeight: 18, marginTop: 10 },
  contactRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: UI_COLORS.borderLight,
  },
  contactBtnIcon: { fontSize: 16 },
  contactBtnLabel: { fontSize: 13, fontWeight: '700', color: UI_COLORS.text },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: UI_COLORS.text },
  mapCard: {
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: '#E8F0EA',
  },
  privacyTitle: { fontSize: 13, fontWeight: '800', color: UI_COLORS.text },
  privacyText: { fontSize: 12, lineHeight: 18, color: UI_COLORS.muted, marginTop: 6 },
  warning: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: UI_COLORS.warning,
  },
  warningText: { fontSize: 12, color: UI_COLORS.error },
  notesLabel: { fontSize: 11, fontWeight: '700', color: UI_COLORS.muted, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  notesText: { fontSize: 13, color: UI_COLORS.text, lineHeight: 20, marginTop: 3 },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: UI_COLORS.card,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.error,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: UI_COLORS.error },
  modalSafe: { flex: 1, backgroundColor: UI_COLORS.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: UI_COLORS.text },
  modalClose: { fontSize: 18, color: UI_COLORS.muted },
  modalContent: { padding: 20, gap: 4, paddingBottom: 60 },
  modalHint: { fontSize: 13, color: UI_COLORS.muted, lineHeight: 19, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: UI_COLORS.text, marginBottom: 6, marginTop: 12 },
  textArea: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: UI_COLORS.text,
    backgroundColor: UI_COLORS.card,
    minHeight: 80,
    lineHeight: 20,
  },
})
