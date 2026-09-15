import type { QueryClient } from '@tanstack/react-query'

import appointmentService, {
  type Appointment,
  type CreateAppointmentData,
} from '../services/appointment.service'
import liveLocationService from '../services/live-location.service'
import { savePendingPaymentRecovery } from './bookingPaymentRecovery'
import { invalidateAfterBooking, qk } from './queryKeys'
import {
  BOOK_APPOINTMENT_MUTATION_KEY,
  isDurableBookingVariables,
} from './durableMutationPolicy'

const LOCATION_REQUIRED_MESSAGE =
  'Necesitamos tu ubicación para conservar la reserva y reanudarla de forma segura cuando vuelva la conexión.'

/**
 * Registers mutation defaults required by TanStack Query to rebuild a paused
 * booking after the JS process is killed and the persisted cache is hydrated.
 *
 * The local useMutation hook can still provide its regular mutationFn and UI
 * callbacks. These defaults become critical only after hydration, because
 * functions themselves are intentionally not serialized by TanStack Query.
 */
export function registerDurableMutationDefaults(queryClient: QueryClient): void {
  queryClient.setMutationDefaults(BOOK_APPOINTMENT_MUTATION_KEY, {
    networkMode: 'online',

    onMutate: async (variables: CreateAppointmentData) => {
      if (!variables.idempotencyKey?.trim()) {
        throw new Error(
          'La reserva offline requiere una clave de idempotencia antes de entrar en la cola.',
        )
      }

      const hasCoordinates =
        typeof variables.serviceLatitude === 'number' &&
        Number.isFinite(variables.serviceLatitude) &&
        typeof variables.serviceLongitude === 'number' &&
        Number.isFinite(variables.serviceLongitude)

      if (!hasCoordinates) {
        const coordinates = await liveLocationService.getDeviceCoordinates()
        if (!coordinates) {
          throw new Error(LOCATION_REQUIRED_MESSAGE)
        }

        variables.serviceLatitude = coordinates.latitude
        variables.serviceLongitude = coordinates.longitude
      }
    },

    mutationFn: async (variables: CreateAppointmentData) => {
      if (!isDurableBookingVariables(variables)) {
        throw new Error(
          'La reserva recuperada no contiene el contrato necesario para un reintento seguro.',
        )
      }

      return appointmentService.createAppointment(variables)
    },

    onSuccess: async (
      appointment: Appointment,
      variables: CreateAppointmentData,
    ) => {
      queryClient.setQueryData(
        qk.appointments.detail(appointment.id),
        appointment,
      )
      await invalidateAfterBooking(queryClient, appointment.id)

      // A hydrated booking no longer has the screen promise continuation that
      // normally starts payment. Persist the continuation, but never execute a
      // financial mutation in the background: the client must confirm it.
      if (variables.idempotencyKey) {
        await savePendingPaymentRecovery({
          appointmentId: appointment.id,
          paymentMethod: variables.paymentMethod,
          amountCop: variables.amount,
          amountCtg: variables.amountCtg,
          idempotencyKey: variables.idempotencyKey,
          createdAt: new Date().toISOString(),
        })
      }
    },
  })
}
