import { create } from 'zustand'
import paymentService, {
  Transaction,
  WalletBalance,
  TransferProofFile,
  VerifyTransferMetadata,
} from '../services/payment.service'

interface WalletState {
  balance: WalletBalance
  transactions: Transaction[]
  isLoading: boolean
  isProcessing: boolean
  error: string | null

  fetchBalance: () => Promise<void>
  fetchTransactions: (filters?: {
    type?: string
    status?: string
    paymentMethod?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }) => Promise<void>
  processPayment: (data: {
    appointmentId: string
    paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
    amountCop: number
    amountCtg?: number
    idempotencyKey?: string
  }) => Promise<void>
  verifyTransfer: (
    transactionId: string,
    file: TransferProofFile,
    metadata: VerifyTransferMetadata,
  ) => Promise<void>
  updateBalance: (balance: Partial<WalletBalance>) => void
  clearError: () => void
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: {
    ctgBalance: 0,
    copBalance: 0,
    pendingCtg: 0,
    pendingCop: 0,
  },
  transactions: [],
  isLoading: false,
  isProcessing: false,
  error: null,

  fetchBalance: async () => {
    set({ isLoading: true, error: null })
    try {
      const balance = await paymentService.getBalance()
      set({ balance, isLoading: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar el saldo',
        isLoading: false,
      })
    }
  },

  fetchTransactions: async (filters) => {
    set({ isLoading: true, error: null })
    try {
      const transactions = await paymentService.getTransactions(filters)
      set({ transactions, isLoading: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar las transacciones',
        isLoading: false,
      })
    }
  },

  processPayment: async (data) => {
    set({ isProcessing: true, error: null })
    try {
      const transaction = await paymentService.processPayment(data)

      set((state) => ({
        transactions: [transaction, ...state.transactions],
        isProcessing: false,
      }))

      if (data.paymentMethod === 'CTG' && data.amountCtg) {
        set((state) => ({
          balance: {
            ...state.balance,
            ctgBalance: state.balance.ctgBalance - data.amountCtg!,
          },
        }))
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al procesar el pago',
        isProcessing: false,
      })
      throw error
    }
  },

  verifyTransfer: async (transactionId, file, metadata) => {
    set({ isProcessing: true, error: null })
    try {
      const updatedTransaction = await paymentService.verifyTransfer(
        transactionId,
        file,
        metadata,
      )

      set((state) => ({
        transactions: state.transactions.map((tx) =>
          tx.id === transactionId ? updatedTransaction : tx,
        ),
        isProcessing: false,
      }))
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al verificar la transferencia',
        isProcessing: false,
      })
      throw error
    }
  },

  updateBalance: (balanceUpdate) => {
    set((state) => ({
      balance: { ...state.balance, ...balanceUpdate },
    }))
  },

  clearError: () => set({ error: null }),
}))
