import type { CreateAppointmentData } from '../services/appointment.service'

/**
 * Phase 44 durable-offline policy.
 *
 * Only mutations that are explicitly safe to replay after a process restart are
 * persisted. A mutation being serializable is not enough: it also needs a
 * backend idempotency contract and all device-only inputs captured up front.
 */
export const BOOK_APPOINTMENT_MUTATION_KEY = ['appointments', 'book'] as const

type MutationLike = {
  options?: {
    mutationKey?: readonly unknown[]
  }
  state?: {
    isPaused?: boolean
    variables?: unknown
  }
}

function isBookAppointmentKey(key?: readonly unknown[]): boolean {
  return (
    key?.length === BOOK_APPOINTMENT_MUTATION_KEY.length &&
    key.every((value, index) => value === BOOK_APPOINTMENT_MUTATION_KEY[index])
  )
}

export function isDurableBookingVariables(
  variables: unknown,
): variables is CreateAppointmentData & {
  idempotencyKey: string
  serviceLatitude: number
  serviceLongitude: number
} {
  if (!variables || typeof variables !== 'object') return false

  const candidate = variables as Partial<CreateAppointmentData>
  return (
    typeof candidate.idempotencyKey === 'string' &&
    candidate.idempotencyKey.trim().length > 0 &&
    typeof candidate.serviceLatitude === 'number' &&
    Number.isFinite(candidate.serviceLatitude) &&
    typeof candidate.serviceLongitude === 'number' &&
    Number.isFinite(candidate.serviceLongitude)
  )
}

/**
 * TanStack persistence predicate. Deliberately excludes payments, uploads,
 * authentication, pet creation and every other mutation until each operation
 * has its own replay-safe contract.
 */
export function shouldDehydrateDurableMutation(mutation: MutationLike): boolean {
  return Boolean(
    mutation.state?.isPaused &&
      isBookAppointmentKey(mutation.options?.mutationKey) &&
      isDurableBookingVariables(mutation.state?.variables),
  )
}
