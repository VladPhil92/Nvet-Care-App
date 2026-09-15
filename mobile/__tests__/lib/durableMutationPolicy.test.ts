import {
  BOOK_APPOINTMENT_MUTATION_KEY,
  isDurableBookingVariables,
  shouldDehydrateDurableMutation,
} from '../../src/lib/durableMutationPolicy'

const bookingVariables = {
  vetId: 'vet-1',
  petId: 'pet-1',
  serviceType: 'CONSULTATION',
  date: '2026-09-20',
  time: '10:00',
  address: 'Calle 1 # 2-3, Cartagena',
  paymentMethod: 'TRANSFER' as const,
  amount: 80000,
  idempotencyKey: '8c734907-4f78-4acf-a1f4-3c612dc20ee1',
  serviceLatitude: 10.391,
  serviceLongitude: -75.479,
}

function mutation(
  variables: unknown,
  overrides?: {
    key?: readonly unknown[]
    isPaused?: boolean
  },
) {
  return {
    options: {
      mutationKey: overrides?.key ?? BOOK_APPOINTMENT_MUTATION_KEY,
    },
    state: {
      isPaused: overrides?.isPaused ?? true,
      variables,
    },
  }
}

describe('durable mutation policy', () => {
  it('accepts a paused booking with idempotency and captured coordinates', () => {
    expect(isDurableBookingVariables(bookingVariables)).toBe(true)
    expect(shouldDehydrateDurableMutation(mutation(bookingVariables))).toBe(true)
  })

  it('rejects bookings without an idempotency key', () => {
    const { idempotencyKey: _removed, ...variables } = bookingVariables

    expect(isDurableBookingVariables(variables)).toBe(false)
    expect(shouldDehydrateDurableMutation(mutation(variables))).toBe(false)
  })

  it('rejects bookings whose device coordinates were not captured', () => {
    const { serviceLatitude: _lat, serviceLongitude: _lng, ...variables } =
      bookingVariables

    expect(isDurableBookingVariables(variables)).toBe(false)
    expect(shouldDehydrateDurableMutation(mutation(variables))).toBe(false)
  })

  it('does not persist replay-unsafe mutation families', () => {
    expect(
      shouldDehydrateDurableMutation(
        mutation(bookingVariables, { key: ['payments', 'process'] }),
      ),
    ).toBe(false)
    expect(
      shouldDehydrateDurableMutation(
        mutation(bookingVariables, { key: ['pets', 'create'] }),
      ),
    ).toBe(false)
  })

  it('does not persist a booking that is not paused', () => {
    expect(
      shouldDehydrateDurableMutation(
        mutation(bookingVariables, { isPaused: false }),
      ),
    ).toBe(false)
  })
})
