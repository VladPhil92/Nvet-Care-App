import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk, invalidateAfterPayment, invalidateAfterVetUpdate } from '../../lib/queryKeys'
import { adminService } from '../../services/admin.service'

/**
 * Mutations para acciones administrativas con optimistic updates.
 *
 * Patrón de optimistic update implementado:
 *  1. `onMutate`: snapshot del cache antes del cambio + actualización optimista
 *  2. `onError`: rollback al snapshot
 *  3. `onSettled`: invalidate queries para refetch
 *
 * Esto da feedback instantáneo al admin sin esperar al servidor,
 * y revierte automáticamente si el backend rechaza la operación.
 */

// ============================================================
// RESOLVE DISPUTE
// ============================================================

interface ResolveDisputeVars {
  transactionId: string
  resolution: 'FAVOR_VET' | 'FAVOR_CLIENT' | 'PARTIAL_REFUND'
  notes: string
}

export function useResolveDisputeMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['admin', 'resolveDispute'],
    mutationFn: ({ transactionId, resolution, notes }: ResolveDisputeVars) =>
      adminService.resolveDispute(transactionId, resolution, notes),

    onMutate: async ({ transactionId, resolution }) => {
      // 1. Cancelar refetches en curso para no sobrescribir nuestro update optimista
      await qc.cancelQueries({ queryKey: qk.admin.transactions.all() })

      // 2. Snapshot del cache actual (para rollback)
      const previousLists = qc.getQueriesData({ queryKey: qk.admin.transactions.all() })

      // 3. Update optimista: marcar la transacción como resuelta
      qc.setQueriesData(
        { queryKey: qk.admin.transactions.all() },
        (old: any) => {
          if (!old?.results) return old
          return {
            ...old,
            results: old.results.map((tx: any) =>
              tx.id === transactionId
                ? {
                    ...tx,
                    status: resolution === 'FAVOR_VET' ? 'LIQUIDADO' : 'DISPUTA',
                    _optimistic: true,
                  }
                : tx,
            ),
          }
        },
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      // Rollback al snapshot
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          qc.setQueryData(key, data)
        }
      }
    },

    onSettled: async (_data, _err, vars) => {
      // Invalidar queries afectadas para refetch desde servidor
      await invalidateAfterPayment(qc, vars?.transactionId)
    },
  })
}

// ============================================================
// UPDATE VET TIER
// ============================================================

interface UpdateVetTierVars {
  vetId: string
  tier: 'free' | 'pro' | 'elite'
  reason?: string
}

export function useUpdateVetTierMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['admin', 'updateVetTier'],
    mutationFn: ({ vetId, tier, reason: _reason }: UpdateVetTierVars) =>
      adminService.updateVetTier(vetId, tier),

    onMutate: async ({ vetId, tier }) => {
      await qc.cancelQueries({ queryKey: qk.admin.veterinarians.all() })

      const previousLists = qc.getQueriesData({
        queryKey: qk.admin.veterinarians.all(),
      })

      // Update optimista en lista de vets
      qc.setQueriesData(
        { queryKey: qk.admin.veterinarians.all() },
        (old: any) => {
          if (!old?.results) return old
          return {
            ...old,
            results: old.results.map((v: any) =>
              v.id === vetId ? { ...v, tier, _optimistic: true } : v,
            ),
          }
        },
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          qc.setQueryData(key, data)
        }
      }
    },

    onSettled: async (_data, _err, vars) => {
      await invalidateAfterVetUpdate(qc, vars?.vetId)
    },
  })
}

// ============================================================
// VERIFY TRANSFER (admin confirma o rechaza)
// ============================================================

interface VerifyTransferVars {
  transactionId: string
  action: 'CONFIRM' | 'REJECT'
  reason?: string
}

export function useVerifyTransferMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['admin', 'verifyTransfer'],
    mutationFn: ({ transactionId, action, reason }: VerifyTransferVars) =>
      adminService.verifyTransfer(transactionId, {
        action,
        reason,
      } as any),

    onMutate: async ({ transactionId, action }) => {
      await qc.cancelQueries({ queryKey: qk.admin.transferTracking() })

      const previous = qc.getQueryData(qk.admin.transferTracking())

      // Update optimista: remover de la cola si action=CONFIRM/REJECT
      qc.setQueryData(qk.admin.transferTracking(), (old: any) => {
        if (!Array.isArray(old)) return old
        return old.filter((tx: any) => tx.id !== transactionId)
      })

      return { previous, transactionId, action }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(qk.admin.transferTracking(), context.previous)
      }
    },

    onSettled: async (_data, _err, vars) => {
      await invalidateAfterPayment(qc, vars?.transactionId)
    },
  })
}

// ============================================================
// EXPORT TRANSACTIONS (no es mutation pero es action; útil hook)
// ============================================================

interface ExportTransactionsVars {
  format: 'csv' | 'xlsx'
  startDate?: string
  endDate?: string
  status?: string
  paymentMethod?: string
}

export function useExportTransactionsMutation() {
  return useMutation({
    mutationKey: ['admin', 'exportTransactions'],
    mutationFn: async (vars: ExportTransactionsVars) => {
      const blob = await adminService.exportTransactions(vars.format, vars)
      // El service retorna blob; aquí disparamos descarga inmediata
      const url = window.URL.createObjectURL(blob as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transacciones_${Date.now()}.${vars.format.toLowerCase()}`
      a.click()
      window.URL.revokeObjectURL(url)
      return { downloaded: true }
    },
  })
}
