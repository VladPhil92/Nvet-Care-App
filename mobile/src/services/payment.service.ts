import api from './api';

interface ProcessPaymentData {
  appointmentId: string;
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER';
  amountCop: number;
  amountCtg?: number;
  /**
   * Idempotency key generada por el cliente (UUID v4 recomendado).
   * Si el request se reintenta tras un timeout, el backend deduplica usando este key
   * y devuelve la misma transacción en lugar de procesar el pago dos veces.
   * Se envía como header HTTP `Idempotency-Key`.
   */
  idempotencyKey?: string;
}

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

interface VerifyTransferData {
  type: 'IMAGE' | 'PDF';
  uri: string;
  fileName: string;
}

const paymentService = {
  /**
   * Process a payment for an appointment.
   * Si se provee `idempotencyKey`, viaja como header HTTP para que el backend
   * deduplique pagos repetidos por causa de retries de red.
   */
  async processPayment(data: ProcessPaymentData): Promise<Transaction> {
    const { idempotencyKey, ...payload } = data;
    const response = await api.post('/payments/process', payload, {
      headers: idempotencyKey
        ? { 'Idempotency-Key': idempotencyKey }
        : undefined,
    });
    return response.data;
  },

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<WalletBalance> {
    const response = await api.get('/payments/balance');
    return response.data;
  },

  /**
   * Get transaction history with optional filters
   */
  async getTransactions(filters?: {
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Transaction[]> {
    const response = await api.get('/payments/transactions', { params: filters });
    return response.data;
  },

  /**
   * Get a specific transaction by ID
   */
  async getTransactionById(id: string): Promise<Transaction> {
    const response = await api.get(`/payments/transactions/${id}`);
    return response.data;
  },

  /**
   * Verify a transfer with proof (image or PDF)
   */
  async verifyTransfer(transferId: string, proof: VerifyTransferData): Promise<Transaction> {
    const formData = new FormData();
    formData.append('proof', {
      uri: proof.uri,
      type: proof.type === 'IMAGE' ? 'image/jpeg' : 'application/pdf',
      name: proof.fileName,
    } as any);

    const response = await api.post(`/payments/verify-transfer/${transferId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Initiate a PSE payment
   */
  async initiatePsePayment(data: {
    appointmentId: string;
    amountCop: number;
    bank: string;
    userType: 'NATURAL' | 'JURIDICA';
  }): Promise<{
    paymentUrl: string;
    transactionId: string;
  }> {
    const response = await api.post('/payments/pse/initiate', data);
    return response.data;
  },

  /**
   * Check PSE payment status
   */
  async checkPsePaymentStatus(transactionId: string): Promise<{
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FAILED';
    transaction?: Transaction;
  }> {
    const response = await api.get(`/payments/pse/status/${transactionId}`);
    return response.data;
  },

  /**
   * Get CTG to COP exchange rate
   */
  async getCtgExchangeRate(): Promise<{
    rate: number; // COP per CTG
    lastUpdated: string;
  }> {
    const response = await api.get('/payments/ctg/rate');
    return response.data;
  },

  /** Alias usado por el hook `useCtgRateQuery`. */
  async getCtgRate(): Promise<{ rate: number; lastUpdated: string }> {
    return this.getCtgExchangeRate();
  },

  /**
   * Request withdrawal (for vets)
   */
  async requestWithdrawal(data: {
    amountCop: number;
    paymentMethod: 'BANK_TRANSFER' | 'NEQUI' | 'DAVIPLATA';
    accountInfo: {
      bankName?: string;
      accountNumber?: string;
      accountType?: 'SAVINGS' | 'CHECKING';
      phoneNumber?: string;
    };
  }): Promise<Transaction> {
    const response = await api.post('/payments/withdrawal', data);
    return response.data;
  },

  /**
   * Get earnings summary (for vets)
   */
  async getEarningsSummary(filters?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{
    totalEarnings: number;
    totalCommissions: number;
    netEarnings: number;
    pendingBalance: number;
    availableBalance: number;
    transactionCount: number;
    byTier: {
      tier: 'FREE' | 'PRO' | 'ELITE';
      earnings: number;
      commissionPct: number;
      commissionAmount: number;
    };
  }> {
    const response = await api.get('/payments/earnings/summary', { params: filters });
    return response.data;
  },
};

export default paymentService;
