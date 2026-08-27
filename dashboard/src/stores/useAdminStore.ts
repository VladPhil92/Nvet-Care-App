import { create } from 'zustand'
import {
  adminService,
  AdminMetrics,
  Transaction,
  Appointment,
  TransferTracking,
  PaymentMethodStats,
} from '../services/admin.service'

interface AdminState {
  metrics: AdminMetrics | null
  transactions: Transaction[]
  appointments: Appointment[]
  transferTracking: TransferTracking[]
  paymentStats: PaymentMethodStats[]

  isLoadingMetrics: boolean
  isLoadingTransactions: boolean
  isLoadingAppointments: boolean
  isLoadingTransfers: boolean
  isLoadingPaymentStats: boolean

  error: string | null

  fetchMetrics: () => Promise<void>
  fetchTransactions: (filters?: any) => Promise<void>
  fetchAppointments: (filters?: any) => Promise<void>
  fetchTransferTracking: () => Promise<void>
  fetchPaymentStats: (period?: string) => Promise<void>
  verifyTransfer: (transactionId: string, verified: boolean) => Promise<void>
  resolveDispute: (transactionId: string, resolution: string, notes?: string) => Promise<void>
  exportTransactions: (format: 'csv' | 'xlsx', filters?: any) => Promise<Blob>
  clearError: () => void
}

export const useAdminStore = create<AdminState>((set, get) => ({
  metrics: null,
  transactions: [],
  appointments: [],
  transferTracking: [],
  paymentStats: [],

  isLoadingMetrics: false,
  isLoadingTransactions: false,
  isLoadingAppointments: false,
  isLoadingTransfers: false,
  isLoadingPaymentStats: false,

  error: null,

  fetchMetrics: async () => {
    set({ isLoadingMetrics: true, error: null })
    try {
      const metrics = await adminService.getMetrics()
      set({ metrics, isLoadingMetrics: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar métricas',
        isLoadingMetrics: false,
      })
    }
  },

  fetchTransactions: async (filters) => {
    set({ isLoadingTransactions: true, error: null })
    try {
      const transactions = await adminService.getTransactions(filters)
      set({ transactions, isLoadingTransactions: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar transacciones',
        isLoadingTransactions: false,
      })
    }
  },

  fetchAppointments: async (filters) => {
    set({ isLoadingAppointments: true, error: null })
    try {
      const appointments = await adminService.getAppointments(filters)
      set({ appointments, isLoadingAppointments: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar citas',
        isLoadingAppointments: false,
      })
    }
  },

  fetchTransferTracking: async () => {
    set({ isLoadingTransfers: true, error: null })
    try {
      const transferTracking = await adminService.getTransferTracking()
      set({ transferTracking, isLoadingTransfers: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar tracking',
        isLoadingTransfers: false,
      })
    }
  },

  fetchPaymentStats: async (period) => {
    set({ isLoadingPaymentStats: true, error: null })
    try {
      const paymentStats = await adminService.getPaymentMethodStats(period)
      set({ paymentStats, isLoadingPaymentStats: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar estadísticas',
        isLoadingPaymentStats: false,
      })
    }
  },

  verifyTransfer: async (transactionId, verified) => {
    try {
      await adminService.verifyTransfer(transactionId, verified)

      const transactions: Transaction[] = get().transactions.map((t) =>
        t.id === transactionId
          ? { ...t, status: (verified ? 'LIQUIDADO' : 'DISPUTA') as Transaction['status'] }
          : t
          ? {
              ...t,
              status: (verified ? 'LIQUIDADO' : 'DISPUTA') as Transaction['status'],
            }
          : t,
      )
      set({ transactions })

      await get().fetchTransferTracking()
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al verificar transferencia',
      })
      throw error
    }
  },

  resolveDispute: async (transactionId, resolution, notes) => {
    try {
      await adminService.resolveDispute(transactionId, resolution as any, notes)

      const transactions: Transaction[] = get().transactions.map((t) =>
        t.id === transactionId ? { ...t, status: 'LIQUIDADO' as const } : t,
      )
      set({ transactions })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al resolver disputa',
      })
      throw error
    }
  },

  exportTransactions: async (format, filters) => {
    try {
      return await adminService.exportTransactions(format, filters)
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al exportar transacciones',
      })
      throw error
    }
  },

  clearError: () => set({ error: null }),
}))
