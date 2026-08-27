import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Badge, Button, Skeleton, UI_COLORS } from '../../components/ui/primitives'
import StatusTimeline, { AppointmentStatus } from '../../components/appointment/StatusTimeline'
import {
  useAppointmentDetailQuery,
  useAppointmentReviewQuery,
} from '../../hooks/queries/useMobileQueries'
import {
  useCancelAppointmentMutation,
  useUpdateAppointmentStatusMutation,
  useAddClinicalNotesMutation,
  useCreateReviewMutation,
} from '../../hooks/queries/useMobileMutations'
import { useAuthStore } from '../../stores/useAuthStore'
import {
  formatAppointmentDate,
  formatCOP,
  formatRatingStars,
} from '../../utils/format'

interface Props {
  navigation: any
  route: { params: { appointmentId: string } }
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En camino',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  DISPUTED: 'En disputa',
}

type BadgeTone = 'sage' | 'gold' | 'success' | 'warning' | 'error' | 'info' | 'muted'

const STATUS_TONE: Record<AppointmentStatus, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'sage',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'muted',
  DISPUTED: 'error',
}

export default function AppointmentDetailScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params
  const { user } = useAuthStore()
  const isVet = user?.role === 'VET'

  const query = useAppointmentDetailQuery(appointmentId)
  const reviewQuery = useAppointmentReviewQuery(
    !isVet ? appointmentId : undefined,
  )

  const cancelMutation = useCancelAppointmentMutation()
  const updateStatusMutation = useUpdateAppointmentStatusMutation()
  const clinicalNotesMutation = useAddClinicalNotesMutation()
  const createReviewMutation = useCreateReviewMutation()

  const [diagnosis, setDiagnosis] = useState('')
  const [treatment, setTreatment] = useState('')
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [showReview, setShowReview] = useState(false)

  const apt = query.data
  const status: AppointmentStatus = apt?.status ?? 'PENDING'

  const handleCancel = () => {
    Alert.alert(
      'Cancelar cita',
      '¿Estás seguro de que quieres cancelar esta cita?',
      [
        { text: 'No, mantener', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () =>
            cancelMutation.mutate(
              { id: appointmentId },
              { onSuccess: () => navigation.goBack() },
            ),
        },
      ],
    )
  }

  const handleStatusUpdate = (nextStatus: AppointmentStatus) => {
    updateStatusMutation.mutate({ id: appointmentId, status: nextStatus })
  }

  const handleSaveClinicalNotes = () => {
    if (!diagnosis.trim() || !treatment.trim()) {
      Alert.alert('Campos requeridos', 'Diagnóstico y tratamiento son obligatorios.')
      return
    }
    clinicalNotesMutation.mutate(
      { id: appointmentId, diagnosis: diagnosis.trim(), treatment: treatment.trim(), notes: clinicalNotes.trim() || undefined },
      {
        onSuccess: () => {
          setShowNotes(false)
          setDiagnosis('')
          setTreatment('')
          setClinicalNotes('')
        },
      },
    )
  }

  const handleSubmitReview = () => {
    createReviewMutation.mutate(
      { appointmentId, rating, comment: comment.trim() || undefined },
      { onSuccess: () => setShowReview(false) },
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Detalle de cita</Text>
        {apt && <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} size="sm" />}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {query.isLoading ? (
          <>
            <Skeleton height={120} />
            <Skeleton height={80} style={{ marginTop: 14 }} />
            <Skeleton height={200} style={{ marginTop: 14 }} />
          </>
        ) : query.isError ? (
          <Text style={styles.error}>
            No pudimos cargar el detalle. Intenta de nuevo.
          </Text>
        ) : apt ? (
          <>
            {/* Info card */}
            <Card>
              <Text style={styles.serviceName}>{apt.serviceType}</Text>
              <Text style={styles.subtle}>
                {formatAppointmentDate(apt.date)} · {apt.time}
              </Text>
              <Text style={[styles.subtle, { marginBottom: 12 }]}>{apt.address}</Text>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Veterinario</Text>
                  <Text style={styles.value}>
                    Dr. {apt.vet.firstName} {apt.vet.lastName}
                  </Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Paciente</Text>
                  <Text style={styles.value}>
                    {apt.pet.name} ({apt.pet.species})
                  </Text>
                </View>
              </View>

              <View style={[styles.row, { marginTop: 12 }]}>
                <View style={styles.col}>
                  <Text style={styles.label}>Monto</Text>
                  <Text style={[styles.value, styles.amount]}>{formatCOP(apt.amount)}</Text>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Método de pago</Text>
                  <Text style={styles.value}>{apt.paymentMethod}</Text>
                </View>
              </View>

              {apt.notes ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.label}>Notas del cliente</Text>
                  <Text style={[styles.value, { fontStyle: 'italic' }]}>"{apt.notes}"</Text>
                </View>
              ) : null}
            </Card>

            {/* Clinical notes (if already saved) */}
            {(apt.diagnosis || apt.treatment) ? (
              <Card style={{ marginTop: 14 }}>
                <Text style={styles.sectionTitle}>Notas clínicas</Text>
                {apt.diagnosis ? (
                  <>
                    <Text style={[styles.label, { marginTop: 8 }]}>Diagnóstico</Text>
                    <Text style={styles.value}>{apt.diagnosis}</Text>
                  </>
                ) : null}
                {apt.treatment ? (
                  <>
                    <Text style={[styles.label, { marginTop: 8 }]}>Tratamiento</Text>
                    <Text style={styles.value}>{apt.treatment}</Text>
                  </>
                ) : null}
              </Card>
            ) : null}

            {/* Status timeline */}
            <Card style={{ marginTop: 14 }}>
              <Text style={styles.sectionTitle}>Estado del servicio</Text>
              <View style={{ marginTop: 8 }}>
                <StatusTimeline currentStatus={status} />
              </View>
            </Card>

            {/* VET actions */}
            {isVet ? (
              <Card style={{ marginTop: 14 }}>
                <Text style={styles.sectionTitle}>Acciones</Text>
                <View style={{ marginTop: 10, gap: 10 }}>
                  {status === 'CONFIRMED' ? (
                    <Button
                      label="Marcar en camino"
                      variant="primary"
                      fullWidth
                      loading={updateStatusMutation.isPending}
                      onPress={() => handleStatusUpdate('IN_PROGRESS')}
                    />
                  ) : null}
                  {status === 'IN_PROGRESS' ? (
                    <Button
                      label="Marcar como completada"
                      variant="primary"
                      fullWidth
                      loading={updateStatusMutation.isPending}
                      onPress={() => handleStatusUpdate('COMPLETED')}
                    />
                  ) : null}
                  {(status === 'IN_PROGRESS' || status === 'COMPLETED') && !apt.diagnosis ? (
                    <Button
                      label={showNotes ? 'Cancelar' : 'Agregar notas clínicas'}
                      variant="secondary"
                      fullWidth
                      onPress={() => setShowNotes((v) => !v)}
                    />
                  ) : null}
                </View>

                {showNotes ? (
                  <View style={{ marginTop: 16, gap: 12 }}>
                    <View>
                      <Text style={styles.label}>Diagnóstico *</Text>
                      <TextInput
                        style={styles.input}
                        value={diagnosis}
                        onChangeText={setDiagnosis}
                        placeholder="Ej: Gastroenteritis aguda"
                        placeholderTextColor={UI_COLORS.muted}
                        multiline
                      />
                    </View>
                    <View>
                      <Text style={styles.label}>Tratamiento *</Text>
                      <TextInput
                        style={styles.input}
                        value={treatment}
                        onChangeText={setTreatment}
                        placeholder="Ej: Metronidazol 250mg por 5 días"
                        placeholderTextColor={UI_COLORS.muted}
                        multiline
                      />
                    </View>
                    <View>
                      <Text style={styles.label}>Notas adicionales</Text>
                      <TextInput
                        style={styles.input}
                        value={clinicalNotes}
                        onChangeText={setClinicalNotes}
                        placeholder="Observaciones, próxima cita…"
                        placeholderTextColor={UI_COLORS.muted}
                        multiline
                      />
                    </View>
                    <Button
                      label="Guardar notas"
                      variant="primary"
                      fullWidth
                      loading={clinicalNotesMutation.isPending}
                      onPress={handleSaveClinicalNotes}
                    />
                  </View>
                ) : null}
              </Card>
            ) : (
              /* CLIENT actions */
              <>
                {status === 'PENDING' ? (
                  <View style={{ marginTop: 14 }}>
                    <Button
                      label="Cancelar cita"
                      variant="danger"
                      fullWidth
                      loading={cancelMutation.isPending}
                      onPress={handleCancel}
                    />
                  </View>
                ) : null}

                {status === 'COMPLETED' && !reviewQuery.data ? (
                  <Card style={{ marginTop: 14 }}>
                    <Text style={styles.sectionTitle}>Calificar veterinario</Text>
                    {showReview ? (
                      <View style={{ marginTop: 10, gap: 12 }}>
                        <View style={styles.stars}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Pressable
                              key={star}
                              onPress={() => setRating(star)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={`${star} estrella${star > 1 ? 's' : ''}`}
                            >
                              <Text style={[styles.star, { color: star <= rating ? UI_COLORS.gold : UI_COLORS.border }]}>
                                ★
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <TextInput
                          style={styles.input}
                          value={comment}
                          onChangeText={setComment}
                          placeholder="Tu opinión sobre el servicio…"
                          placeholderTextColor={UI_COLORS.muted}
                          multiline
                        />
                        <Button
                          label="Enviar calificación"
                          variant="primary"
                          accent="gold"
                          fullWidth
                          loading={createReviewMutation.isPending}
                          onPress={handleSubmitReview}
                        />
                        <Button
                          label="Cancelar"
                          variant="ghost"
                          fullWidth
                          onPress={() => setShowReview(false)}
                        />
                      </View>
                    ) : (
                      <View style={{ marginTop: 10 }}>
                        <Button
                          label="Dejar reseña"
                          variant="secondary"
                          accent="gold"
                          fullWidth
                          onPress={() => setShowReview(true)}
                        />
                      </View>
                    )}
                  </Card>
                ) : null}

                {reviewQuery.data ? (
                  <Card style={{ marginTop: 14 }}>
                    <Text style={styles.sectionTitle}>Tu reseña</Text>
                    <Text style={styles.ratingStars}>
                      {formatRatingStars(reviewQuery.data.rating)}
                    </Text>
                    {reviewQuery.data.comment ? (
                      <Text style={[styles.value, { fontStyle: 'italic', marginTop: 4 }]}>
                        "{reviewQuery.data.comment}"
                      </Text>
                    ) : null}
                  </Card>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    gap: 10,
  },
  back: { fontSize: 28, color: UI_COLORS.sage, lineHeight: 32 },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text, flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  row: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: UI_COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  value: { fontSize: 14, color: UI_COLORS.text, fontWeight: '500' },
  subtle: { fontSize: 13, color: UI_COLORS.muted, marginTop: 2 },
  amount: { color: UI_COLORS.sage, fontWeight: '700', fontSize: 15 },
  serviceName: {
    fontSize: 20,
    fontWeight: '800',
    color: UI_COLORS.text,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.text,
  },
  input: {
    backgroundColor: UI_COLORS.bg,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: UI_COLORS.text,
    minHeight: 60,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  stars: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  star: { fontSize: 30 },
  ratingStars: { fontSize: 20, color: UI_COLORS.gold, marginTop: 6 },
  error: {
    fontSize: 14,
    color: UI_COLORS.error,
    textAlign: 'center',
    marginTop: 40,
  },
})
