import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.fn()
const post = vi.fn()

vi.mock('./api', () => ({
  apiClient: { get, post },
}))

// Imported after the mock so adminService is built against the mocked client.
const { adminService } = await import('./admin.service')

describe('adminService.getTransferTracking', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('maps a full API row into the tracking shape the admin table renders', async () => {
    get.mockResolvedValue({
      data: [
        {
          id: 'tx-1',
          appointmentId: 'appt-1',
          amountCop: 120000,
          status: 'VERIFYING',
          transferCode: 'TRX-1',
          transferProofStorageKey: 'cloudinary:key',
          waitingMinutes: 42,
          appointment: {
            client: { firstName: 'Ana', lastName: 'Ruiz' },
            vet: { id: 'vet-1', tier: 'PRO', user: { firstName: 'Dr.', lastName: 'Lopez' } },
          },
        },
      ],
    })

    const [row] = await adminService.getTransferTracking()

    expect(row).toEqual({
      id: 'tx-1',
      appointmentId: 'appt-1',
      vet: 'Dr. Lopez',
      vetId: 'vet-1',
      tier: 'pro',
      client: 'Ana Ruiz',
      amount: 120000,
      status: 'Pendiente',
      rawStatus: 'VERIFYING',
      proofAvailable: true,
      transferCode: 'TRX-1',
      waitingMinutes: 42,
    })
  })

  it('falls back safely when the appointment relation is missing fields', async () => {
    get.mockResolvedValue({
      data: [
        {
          id: 'tx-2',
          appointmentId: 'appt-2',
          amountCop: 50000,
          status: 'PENDING',
        },
      ],
    })

    const [row] = await adminService.getTransferTracking()

    expect(row.vet).toBe('Veterinario')
    expect(row.vetId).toBe('')
    expect(row.client).toBe('Cliente')
    expect(row.tier).toBe('free')
    expect(row.proofAvailable).toBe(false)
    expect(row.transferCode).toBeUndefined()
    expect(row.waitingMinutes).toBe(0)
  })

  it('never trusts an unrecognized tier string as pro/elite', async () => {
    get.mockResolvedValue({
      data: [
        {
          id: 'tx-3',
          appointmentId: 'appt-3',
          amountCop: 1000,
          status: 'PENDING',
          appointment: { vet: { tier: 'SUPER_SECRET_TIER' } },
        },
      ],
    })

    const [row] = await adminService.getTransferTracking()

    expect(row.tier).toBe('free')
  })

  it('coerces a non-numeric amount instead of propagating NaN to the ledger view', async () => {
    get.mockResolvedValue({
      data: [{ id: 'tx-4', appointmentId: 'appt-4', amountCop: null, status: 'PENDING' }],
    })

    const [row] = await adminService.getTransferTracking()

    expect(row.amount).toBe(0)
    expect(Number.isNaN(row.amount)).toBe(false)
  })
})

describe('adminService.verifyTransfer', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: undefined })
  })

  it('hits the approve endpoint with no body on confirm', async () => {
    await adminService.verifyTransfer('tx-1', { action: 'CONFIRM' })

    expect(post).toHaveBeenCalledWith('/payments/manual-transfer/tx-1/approve')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('never calls the reject endpoint when confirming', async () => {
    await adminService.verifyTransfer('tx-1', { action: 'CONFIRM' })

    const rejectCalls = post.mock.calls.filter(([url]) => String(url).includes('/reject'))
    expect(rejectCalls).toHaveLength(0)
  })

  it('hits the reject endpoint with the trimmed reason on reject', async () => {
    await adminService.verifyTransfer('tx-2', {
      action: 'REJECT',
      reason: '  el comprobante no coincide  ',
    })

    expect(post).toHaveBeenCalledWith('/payments/manual-transfer/tx-2/reject', {
      reason: 'el comprobante no coincide',
    })
  })

  it('sends a default reason rather than an empty one when none is given', async () => {
    await adminService.verifyTransfer('tx-3', { action: 'REJECT' })

    expect(post).toHaveBeenCalledWith('/payments/manual-transfer/tx-3/reject', {
      reason: 'No fue posible validar la transferencia con el comprobante recibido.',
    })
  })

  it('sends the default reason when given only whitespace', async () => {
    await adminService.verifyTransfer('tx-4', { action: 'REJECT', reason: '   ' })

    expect(post).toHaveBeenCalledWith('/payments/manual-transfer/tx-4/reject', {
      reason: 'No fue posible validar la transferencia con el comprobante recibido.',
    })
  })

  it('accepts the legacy boolean signature as an alias for CONFIRM/REJECT', async () => {
    await adminService.verifyTransfer('tx-5', true)
    expect(post).toHaveBeenLastCalledWith('/payments/manual-transfer/tx-5/approve')

    await adminService.verifyTransfer('tx-6', false)
    expect(post).toHaveBeenLastCalledWith('/payments/manual-transfer/tx-6/reject', {
      reason: 'No fue posible validar la transferencia con el comprobante recibido.',
    })
  })
})

describe('adminService.getTransferProof', () => {
  it('requests the proof as a blob rather than JSON', async () => {
    get.mockReset()
    get.mockResolvedValue({ data: new Blob(['bytes']) })

    await adminService.getTransferProof('tx-1')

    expect(get).toHaveBeenCalledWith(
      '/payments/manual-transfer/tx-1/proof',
      { responseType: 'blob' },
    )
  })
})
