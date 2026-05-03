import { create } from 'zustand';
import paymentService from '../services/payment.service';

interface Transaction {
  id: string;
  type: 'PAYMENT' | 'COMMISSION' | 'DEPOSIT' | 'WITHDRAWAL';
  amountCop: number;
  amountCtg?: number;
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER';
  status: 'PENDING' | 'VERIFYING' | 'CONFIRMED' | 'LIQUIDATED' | 'DISPUTED' | 'FAILED';
  description: string;
  appointmentId?: string;
  commissionPct?: number;
  hashOnchain?: string;
  transferProof?: string;
  createdAt: string;
  updatedAt: string;
}

interface WalletBalance {
  ctgBalance: number;
  copBalance: number;
  pendingCtg: number;
  pendingCop: number;
}

interface WalletState {
  balance: WalletBalance;
  transactions: Transaction[];
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;

  // Actions
  fetchBalance: () => Promise<void>;
  fetchTransactions: (filters?: {
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  processPayment: (data: {
    appointmentId: string;
    paymentMethod: 'CTG' | 'PSE' | 'TRANSFER';
    amountCop: number;
    amountCtg?: number;
  }) => Promise<void>;
  verifyTransfer: (transferId: string, proof: {
    type: 'IMAGE' | 'PDF';
    uri: string;
    fileName: string;
  }) => Promise<void>;
  updateBalance: (balance: Partial<WalletBalance>) => void;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
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
    set({ isLoading: true, error: null });
    try {
      const balance = await paymentService.getBalance();
      set({ balance, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar el saldo',
        isLoading: false,
      });
    }
  },

  fetchTransactions: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const transactions = await paymentService.getTransactions(filters);
      set({ transactions, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar las transacciones',
        isLoading: false,
      });
    }
  },

  processPayment: async (data) => {
    set({ isProcessing: true, error: null });
    try {
      const transaction = await paymentService.processPayment(data);
      
      // Add new transaction to the list
      set((state) => ({
        transactions: [transaction, ...state.transactions],
        isProcessing: false,
      }));

      // Update balance if payment was with CTG
      if (data.paymentMethod === 'CTG' && data.amountCtg) {
        set((state) => ({
          balance: {
            ...state.balance,
            ctgBalance: state.balance.ctgBalance - data.amountCtg!,
          },
        }));
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al procesar el pago',
        isProcessing: false,
      });
      throw error;
    }
  },

  verifyTransfer: async (transferId: string, proof: { type: 'IMAGE' | 'PDF'; uri: string; fileName: string }) => {
    set({ isProcessing: true, error: null });
    try {
      const updatedTransaction = await paymentService.verifyTransfer(transferId, proof);
      
      // Update transaction in the list
      set((state) => ({
        transactions: state.transactions.map((tx) =>
          tx.id === transferId ? updatedTransaction : tx
        ),
        isProcessing: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al verificar la transferencia',
        isProcessing: false,
      });
      throw error;
    }
  },

  updateBalance: (balanceUpdate: Partial<WalletBalance>) => {
    set((state) => ({
      balance: { ...state.balance, ...balanceUpdate },
    }));
  },

  clearError: () => {
    set({ error: null });
  },
}));
