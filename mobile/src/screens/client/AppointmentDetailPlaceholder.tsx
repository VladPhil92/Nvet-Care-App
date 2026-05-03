import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, Badge, UI_COLORS } from '../../components/ui/primitives'
import { useAppointmentDetailQuery } from '../../hooks/queries/useMobileQueries'
import {
  formatAppointmentDate,
  formatCOP,
} from '../../utils/format'

/**
 * AppointmentDetailPlaceholder — vista compacta del detalle de cita.
 *
 * Será reemplazado por una pantalla completa con:
 *  - Acciones (cancelar, reprogramar, abrir chat)
 *  - Tracking en tiempo real
 *  - Notas clínicas (post-completed)
 *  - Reseña del vet (post-completed)
 *
 * Por ahora muestra los datos básicos para validar el wiring de navigation.
 */

interface Props {
  navigation: any
  route: { params: { appointmentId: string } }
}

export default function AppointmentDetailPlaceholder({ navigation, route }: Props) {
  const { appointmentId } = route.params
  const query = useAppointmentDetailQuery(appointmentId)

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
        <Text style={styles.title}>Detalle de cita</Text>
      </View>

      <View style={styles.content}>
        {query.isLoading ? (
          <Text style={styles.subtle}>Cargando…</Text>
        ) : query.isError ? (
          <Text style={[styles.subtle, { color: UI_COLORS.error }]}>
            No pudimos cargar el detalle.
          </Text>
        ) : query.data ? (
          <Card>
            <Badge label={query.data.status} tone="sage" size="sm" />
            <Text style={styles.service}>{query.data.serviceType}</Text>
            <Text style={styles.subtle}>
              {formatAppointmentDate(query.data.date)} · {query.data.time}
            </Text>
            <Text style={styles.subtle}>
              Dr. {query.data.vet.firstName} {query.data.vet.lastName}
            </Text>
            <Text style={styles.amount}>{formatCOP(query.data.amount)}</Text>
            <Text style={[styles.subtle, { marginTop: 12 }]}>
              {query.data.address}
            </Text>
            {query.data.notes && (
              <Text style={[styles.subtle, { marginTop: 12, fontStyle: 'italic' }]}>
                "{query.data.notes}"
              </Text>
            )}
          </Card>
        ) : null}

        <Text style={styles.notice}>
          Pantalla completa próximamente: tracking en tiempo real, chat, notas
          clínicas y reseñas.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    gap: 8,
  },
  back: { fontSize: 28, color: UI_COLORS.sage },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  content: { padding: 16, gap: 12 },
  service: {
    fontSize: 18,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginTop: 8,
  },
  subtle: { fontSize: 13, color: UI_COLORS.muted, marginTop: 4 },
  amount: { fontSize: 18, fontWeight: '800', color: UI_COLORS.sage, marginTop: 8 },
  notice: {
    fontSize: 12,
    color: UI_COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 24,
  },
})
