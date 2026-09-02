import React, { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, UI_COLORS } from '../../components/ui/primitives'
import { useCurrentUserQuery, useMyPetsQuery } from '../../hooks/queries/useMobileQueries'
import {
  useAiStatusQuery,
  useClientAiAssistMutation,
  useVetAiAssistMutation,
} from '../../hooks/queries/useAiAssist'
import appointmentService from '../../services/appointment.service'
import type { ClientAiMode, ClientUrgency, VetAiMode } from '../../services/ai.service'
import { getErrorMessage } from '../../services/api'

const urgencyCopy: Record<ClientUrgency, { label: string; tone: 'success' | 'info' | 'warning' | 'error' }> = {
  routine: { label: 'Rutina', tone: 'success' },
  soon: { label: 'Consultar pronto', tone: 'info' },
  urgent: { label: 'Urgente hoy', tone: 'warning' },
  emergency: { label: 'Emergencia', tone: 'error' },
}

export default function AiAssistantScreen() {
  const currentUser = useCurrentUserQuery()
  const role = currentUser.data?.role
  const isVet = role === 'VET'
  const isClient = role === 'CLIENT'

  const petsQuery = useMyPetsQuery({ enabled: isClient })
  const appointmentsQuery = useQuery({
    queryKey: ['ai', 'vet-appointments'],
    queryFn: () => appointmentService.getAppointments(),
    enabled: isVet,
    staleTime: 30_000,
  })
  const statusQuery = useAiStatusQuery(Boolean(role))
  const clientMutation = useClientAiAssistMutation()
  const vetMutation = useVetAiAssistMutation()

  const [selectedPetId, setSelectedPetId] = useState('')
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('')
  const [clientMode, setClientMode] = useState<ClientAiMode>('CARE_GUIDANCE')
  const [vetMode, setVetMode] = useState<VetAiMode>('CASE_REVIEW')
  const [question, setQuestion] = useState('')

  const vetAppointments = useMemo(
    () =>
      (appointmentsQuery.data || []).filter((appointment) =>
        ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(appointment.status),
      ),
    [appointmentsQuery.data],
  )

  useEffect(() => {
    if (isClient && !selectedPetId && petsQuery.data?.length) {
      setSelectedPetId(petsQuery.data[0].id)
    }
  }, [isClient, petsQuery.data, selectedPetId])

  useEffect(() => {
    if (isVet && !selectedAppointmentId && vetAppointments.length) {
      setSelectedAppointmentId(vetAppointments[0].id)
    }
  }, [isVet, selectedAppointmentId, vetAppointments])

  const isPending = clientMutation.isPending || vetMutation.isPending
  const canSubmit =
    question.trim().length >= 3 &&
    (isClient ? Boolean(selectedPetId) : isVet ? Boolean(selectedAppointmentId) : false)

  const handleSubmit = async () => {
    if (!canSubmit || isPending) return
    const cleanQuestion = question.trim()
    if (isClient) {
      await clientMutation.mutateAsync({
        petId: selectedPetId,
        question: cleanQuestion,
        mode: clientMode,
      }).catch(() => undefined)
      return
    }
    if (isVet) {
      await vetMutation.mutateAsync({
        appointmentId: selectedAppointmentId,
        question: cleanQuestion,
        mode: vetMode,
      }).catch(() => undefined)
    }
  }

  const mutationError = clientMutation.error || vetMutation.error

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{isVet ? 'COPILOTO CLÍNICO' : 'NVET CARE AI'}</Text>
          <Text style={styles.title}>
            {isVet ? 'Asistencia para tu práctica' : 'Orientación para cuidar mejor'}
          </Text>
          <Text style={styles.subtitle}>
            {isVet
              ? 'Organiza casos y documentación usando el contexto autorizado de la cita. La decisión clínica siempre es tuya.'
              : 'Describe lo que observas. La IA organiza la información, detecta señales de alarma y te ayuda a preparar la consulta.'}
          </Text>
        </View>

        <Card variant="flat" style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Badge
              label={statusQuery.data?.enabled ? 'IA disponible' : 'IA por configurar'}
              tone={statusQuery.data?.enabled ? 'success' : 'warning'}
              size="sm"
              outline
            />
            {statusQuery.data?.model && (
              <Text style={styles.modelLabel}>{statusQuery.data.model}</Text>
            )}
          </View>
          <Text style={styles.statusText}>
            No sustituye una consulta, no crea diagnósticos autónomos y no prescribe por sí sola.
          </Text>
        </Card>

        {isClient && (
          <>
            <Text style={styles.sectionTitle}>Mascota</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {(petsQuery.data || []).map((pet) => (
                <ChoiceChip
                  key={pet.id}
                  label={`${pet.name} · ${pet.species}`}
                  selected={selectedPetId === pet.id}
                  onPress={() => setSelectedPetId(pet.id)}
                  accent="sage"
                />
              ))}
            </ScrollView>
            {!petsQuery.isLoading && !petsQuery.data?.length && (
              <Text style={styles.emptyText}>Añade una mascota a tu perfil para usar asistencia contextual.</Text>
            )}

            <Text style={styles.sectionTitle}>Objetivo</Text>
            <View style={styles.chipsRow}>
              <ChoiceChip
                label="Orientación"
                selected={clientMode === 'CARE_GUIDANCE'}
                onPress={() => setClientMode('CARE_GUIDANCE')}
                accent="sage"
              />
              <ChoiceChip
                label="Preparar consulta"
                selected={clientMode === 'PRE_VISIT'}
                onPress={() => setClientMode('PRE_VISIT')}
                accent="sage"
              />
            </View>
          </>
        )}

        {isVet && (
          <>
            <Text style={styles.sectionTitle}>Caso activo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {vetAppointments.map((appointment) => (
                <ChoiceChip
                  key={appointment.id}
                  label={`${appointment.pet.name} · ${appointment.serviceName || appointment.serviceType}`}
                  selected={selectedAppointmentId === appointment.id}
                  onPress={() => setSelectedAppointmentId(appointment.id)}
                  accent="gold"
                />
              ))}
            </ScrollView>
            {!appointmentsQuery.isLoading && !vetAppointments.length && (
              <Text style={styles.emptyText}>No tienes citas activas disponibles para análisis contextual.</Text>
            )}

            <Text style={styles.sectionTitle}>Objetivo</Text>
            <View style={styles.chipsRow}>
              <ChoiceChip
                label="Revisión de caso"
                selected={vetMode === 'CASE_REVIEW'}
                onPress={() => setVetMode('CASE_REVIEW')}
                accent="gold"
              />
              <ChoiceChip
                label="Borrador clínico"
                selected={vetMode === 'DOCUMENTATION'}
                onPress={() => setVetMode('DOCUMENTATION')}
                accent="gold"
              />
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>{isVet ? 'Consulta al copiloto' : '¿Qué estás observando?'}</Text>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          multiline
          maxLength={isVet ? 2000 : 1500}
          placeholder={
            isVet
              ? 'Ej.: Resume los problemas principales y qué información falta antes de cerrar la valoración.'
              : 'Ej.: Desde esta mañana está decaído, no quiso desayunar y vomitó una vez.'
          }
          placeholderTextColor={UI_COLORS.muted}
          style={styles.input}
          textAlignVertical="top"
          accessibilityLabel="Pregunta para el asistente de inteligencia artificial"
        />
        <Text style={styles.counter}>{question.length}/{isVet ? 2000 : 1500}</Text>

        <Button
          label={isPending ? 'Analizando contexto…' : 'Analizar con Nvet Care AI'}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={isPending}
          fullWidth
          accent={isVet ? 'gold' : 'sage'}
        />

        {mutationError && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>No fue posible completar el análisis</Text>
            <Text style={styles.errorText}>{getErrorMessage(mutationError)}</Text>
          </Card>
        )}

        {clientMutation.data && <ClientResultCard response={clientMutation.data} />}
        {vetMutation.data && <VetResultCard response={vetMutation.data} />}
      </ScrollView>
    </SafeAreaView>
  )
}

function ChoiceChip({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string
  selected: boolean
  onPress: () => void
  accent: 'sage' | 'gold'
}) {
  const activeColor = accent === 'gold' ? UI_COLORS.gold : UI_COLORS.sage
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        selected && { borderColor: activeColor, backgroundColor: `${activeColor}14` },
      ]}
    >
      <Text style={[styles.chipText, selected && { color: activeColor, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  )
}

function ClientResultCard({ response }: { response: any }) {
  const result = response.result
  const urgency = urgencyCopy[result.urgency as ClientUrgency]
  return (
    <Card variant="elevated" style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <Text style={styles.resultTitle}>Orientación</Text>
        <Badge label={urgency.label} tone={urgency.tone} size="sm" />
      </View>
      <Text style={styles.summary}>{result.summary}</Text>
      <ResultList title="Qué hacer ahora" items={result.recommendedActions} />
      {!!result.redFlags?.length && <ResultList title="Señales de alarma" items={result.redFlags} />}
      {!!result.questionsForVet?.length && <ResultList title="Preguntas útiles para el veterinario" items={result.questionsForVet} />}
      <Text style={styles.boundary}>{result.selfCareBoundary}</Text>
      <Text style={styles.disclaimer}>{result.disclaimer}</Text>
    </Card>
  )
}

function VetResultCard({ response }: { response: any }) {
  const result = response.result
  return (
    <Card variant="elevated" style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <Text style={styles.resultTitle}>Copiloto de caso</Text>
        <Badge label={`Confianza ${result.confidence}`} tone="gold" size="sm" outline />
      </View>
      <Text style={styles.summary}>{result.caseSummary}</Text>
      <ResultList title="Lista de problemas" items={result.problemList} />
      <ResultList title="Diferenciales a considerar" items={result.differentialConsiderations} />
      <ResultList title="Información faltante" items={result.missingInformation} />
      {!!result.redFlags?.length && <ResultList title="Alertas" items={result.redFlags} />}
      <ResultList title="Próximos pasos sugeridos" items={result.suggestedNextSteps} />
      <Text style={styles.subheading}>Borrador de documentación</Text>
      <Text style={styles.documentLine}>S: {result.documentationDraft.subjective}</Text>
      <Text style={styles.documentLine}>O: {result.documentationDraft.objective}</Text>
      <Text style={styles.documentLine}>A: {result.documentationDraft.assessmentSupport}</Text>
      <Text style={styles.documentLine}>P: {result.documentationDraft.planSupport}</Text>
      <Text style={styles.disclaimer}>{result.disclaimer}</Text>
    </Card>
  )
}

function ResultList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return (
    <View style={styles.listBlock}>
      <Text style={styles.subheading}>{title}</Text>
      {items.map((item, index) => (
        <Text key={`${title}-${index}`} style={styles.listItem}>• {item}</Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1, color: UI_COLORS.gold },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: UI_COLORS.text, marginTop: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, color: UI_COLORS.muted, marginTop: 8 },
  statusCard: { marginBottom: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  modelLabel: { fontSize: 11, color: UI_COLORS.muted, fontWeight: '600' },
  statusText: { fontSize: 12, lineHeight: 17, color: UI_COLORS.muted, marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: UI_COLORS.text, marginTop: 16, marginBottom: 8 },
  chipsRow: { flexDirection: 'row', gap: 8, paddingRight: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: UI_COLORS.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: UI_COLORS.card },
  chipText: { fontSize: 12, color: UI_COLORS.muted },
  emptyText: { fontSize: 12, color: UI_COLORS.muted, fontStyle: 'italic' },
  input: { minHeight: 130, borderWidth: 1, borderColor: UI_COLORS.border, borderRadius: 12, backgroundColor: UI_COLORS.card, color: UI_COLORS.text, padding: 12, fontSize: 14, lineHeight: 20 },
  counter: { textAlign: 'right', fontSize: 10, color: UI_COLORS.muted, marginTop: 4, marginBottom: 12 },
  errorCard: { marginTop: 16, borderColor: UI_COLORS.error },
  errorTitle: { color: UI_COLORS.error, fontWeight: '700', fontSize: 13 },
  errorText: { color: UI_COLORS.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  resultCard: { marginTop: 20 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultTitle: { fontSize: 18, fontWeight: '800', color: UI_COLORS.text },
  summary: { fontSize: 14, lineHeight: 21, color: UI_COLORS.text, marginTop: 12 },
  listBlock: { marginTop: 16 },
  subheading: { fontSize: 13, fontWeight: '700', color: UI_COLORS.text, marginBottom: 6 },
  listItem: { fontSize: 13, lineHeight: 19, color: UI_COLORS.muted, marginBottom: 4 },
  boundary: { fontSize: 12, lineHeight: 18, color: UI_COLORS.text, marginTop: 16, fontWeight: '600' },
  disclaimer: { fontSize: 11, lineHeight: 16, color: UI_COLORS.muted, fontStyle: 'italic', marginTop: 16 },
  documentLine: { fontSize: 12, lineHeight: 18, color: UI_COLORS.muted, marginBottom: 5 },
})
