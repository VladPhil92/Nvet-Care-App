import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { qk } from '../../lib/queryKeys'

const verifyTransfer = vi.fn()

vi.mock('../../services/admin.service', () => ({
  adminService: { verifyTransfer },
}))

const { useVerifyTransferMutation } = await import('./useAdminMutations')

/**
 * The admin transfer queue is optimistic: a decision removes the row from
 * the table immediately, before the network call returns. If the backend
 * refuses it (a competing admin already decided it, per the backend's own
 * atomic-claim guard), the row must reappear — otherwise an admin sees a
 * transfer vanish from the queue while it is, in fact, still unresolved.
 */
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const PENDING_QUEUE = [
  { id: 'tx-1', client: 'Ana Ruiz' },
  { id: 'tx-2', client: 'Luis Gomez' },
]

describe('useVerifyTransferMutation', () => {
  beforeEach(() => {
    verifyTransfer.mockReset()
  })

  it('removes the transaction from the queue optimistically, before the network resolves', async () => {
    const qc = makeClient()
    qc.setQueryData(qk.admin.transferTracking(), PENDING_QUEUE)

    let resolveNetwork: () => void = () => {}
    verifyTransfer.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveNetwork = resolve
      }),
    )

    const { result } = renderHook(() => useVerifyTransferMutation(), {
      wrapper: wrapperFor(qc),
    })

    result.current.mutate({ transactionId: 'tx-1', action: 'CONFIRM' })

    await waitFor(() => {
      expect(qc.getQueryData(qk.admin.transferTracking())).toEqual([
        { id: 'tx-2', client: 'Luis Gomez' },
      ])
    })

    resolveNetwork()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('restores the removed row when the backend rejects the decision', async () => {
    const qc = makeClient()
    qc.setQueryData(qk.admin.transferTracking(), PENDING_QUEUE)
    verifyTransfer.mockRejectedValue(
      new Error('La transferencia ya fue revisada por otro administrador'),
    )

    const { result } = renderHook(() => useVerifyTransferMutation(), {
      wrapper: wrapperFor(qc),
    })

    result.current.mutate({ transactionId: 'tx-1', action: 'CONFIRM' })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(qc.getQueryData(qk.admin.transferTracking())).toEqual(PENDING_QUEUE)
  })

  it('leaves the cache untouched when it holds something other than an array', async () => {
    const qc = makeClient()
    qc.setQueryData(qk.admin.transferTracking(), undefined)
    verifyTransfer.mockResolvedValue(undefined)

    const { result } = renderHook(() => useVerifyTransferMutation(), {
      wrapper: wrapperFor(qc),
    })

    result.current.mutate({ transactionId: 'tx-1', action: 'CONFIRM' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(qc.getQueryData(qk.admin.transferTracking())).toBeUndefined()
  })

  it('passes the reason through to the service call on reject', async () => {
    const qc = makeClient()
    qc.setQueryData(qk.admin.transferTracking(), PENDING_QUEUE)
    verifyTransfer.mockResolvedValue(undefined)

    const { result } = renderHook(() => useVerifyTransferMutation(), {
      wrapper: wrapperFor(qc),
    })

    result.current.mutate({
      transactionId: 'tx-2',
      action: 'REJECT',
      reason: 'comprobante ilegible',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(verifyTransfer).toHaveBeenCalledWith('tx-2', {
      action: 'REJECT',
      reason: 'comprobante ilegible',
    })
  })
})
