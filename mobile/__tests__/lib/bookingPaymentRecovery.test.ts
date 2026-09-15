const mockStorage: Record<string, string> = {}

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage[key] = value
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockStorage[key]
  }),
}))

import {
  clearPendingPaymentRecovery,
  getPendingPaymentRecovery,
  savePendingPaymentRecovery,
} from '../../src/lib/bookingPaymentRecovery'

const recovery = {
  appointmentId: 'appointment-1',
  paymentMethod: 'TRANSFER' as const,
  amountCop: 80000,
  idempotencyKey: '9e332df9-00d3-45b0-8f05-846c31e82677',
  createdAt: '2026-09-14T23:45:00.000Z',
}

describe('booking payment recovery handoff', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
  })

  it('persists the financial continuation without executing payment', async () => {
    await savePendingPaymentRecovery(recovery)

    await expect(
      getPendingPaymentRecovery(recovery.appointmentId),
    ).resolves.toEqual(recovery)
  })

  it('keeps independent recovered appointments isolated', async () => {
    await savePendingPaymentRecovery(recovery)
    await savePendingPaymentRecovery({
      ...recovery,
      appointmentId: 'appointment-2',
      paymentMethod: 'CTG',
    })

    await clearPendingPaymentRecovery(recovery.appointmentId)

    await expect(
      getPendingPaymentRecovery(recovery.appointmentId),
    ).resolves.toBeNull()
    await expect(getPendingPaymentRecovery('appointment-2')).resolves.toMatchObject({
      appointmentId: 'appointment-2',
      paymentMethod: 'CTG',
    })
  })

  it('rejects corrupted recovery records instead of offering an unsafe payment', async () => {
    mockStorage['nvet-care-booking-payment-recovery-v1'] = JSON.stringify({
      [recovery.appointmentId]: {
        ...recovery,
        idempotencyKey: '',
      },
    })

    await expect(
      getPendingPaymentRecovery(recovery.appointmentId),
    ).resolves.toBeNull()
  })
})
