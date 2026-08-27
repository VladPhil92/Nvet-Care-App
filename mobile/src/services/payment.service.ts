import api from './api'

export interface ProcessPaymentData {
  appointmentId: string
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
  amountCop: number
  amountCtg?: number
  idempotencyKey?: string
}

export interface Transaction {
  id: string
  type?: 'PAYMENT' | 'COMMISSION' | 'DEPOSIT' | 'WITHDRAWAL'
  amountCop: number
  amountCtg?: number
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
  status:
    | 'PENDING'
    | 'VERIFYING'
    | 'CONFIRMED'
    | 'LIQUIDATED'
    | 'DISPUTED'
    | 'FAILED'
  description?: string
  appointmentId?: string
  commissionPct?: number
  hashOnchain?: string
  transferProof?: string
  createdAt: string
  updatedAt: string
}

export interface TransactionPage {
  results: Transaction[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface WalletBalance {
  ctgBalance: number
  copBalance: number
  pendingCtg: number
  pendingCop: number
}

export interface TransferProofFile {
  uri: string
  name: string
  type: string
}

export interface VerifyTransferMetadata {
  transferCode: string
  transferDate?: string
}

export interface WithdrawalResponse {
  success: boolean
  message: string
  requestedAmount: number
  method: 'BANK_TRANSFER' | 'NEQUI' | 'DAVIPLATA'
  estimatedArrival: string
}

const paymentService = {
  async processPayment(data: ProcessPaymentData): Promise<Transaction> {
    const { idempotencyKey, ...payload } = data
    const response = await api.post(
      '/payments/process',
      {
        ...payload,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      {
        headers: idempotencyKey
          ? { 'Idempotency-Key': idempotencyKey }
          : undefined,
      },
    )
    return response.data
  },

  async getBalance(): Promise<WalletBalance> {
    const response = await api.get('/payments/me/balance')
    return response.data
  },

  async getTransactionPage(filters?: {
    type?: string
    status?: string
    paymentMethod?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }): Promise<TransactionPage> {
    const response = await api.get('/payments/transactions', { params: filters })
    return response.data
  },

  /**
   * Convenience API used by list screens: backend pagination is normalized to
   * a plain array here so callers never accidentally iterate the page object.
   */
  async getTransactions(filters?: {
    type?: string
    status?: string
    paymentMethod?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }): Promise<Transaction[]> {
    const page = await this.getTransactionPage(filters)
    return page.results
  },

  async getTransactionById(id: string): Promise<Transaction> {
    const response = await api.get(`/payments/transactions/${id}`)
    return response.data
  },

  async verifyTransfer(
    transactionId: string,
    file: TransferProofFile,
    metadata: VerifyTransferMetadata,
  ): Promise<Transaction> {
    const formData = new FormData()
    formData.append('file', {
      uri: file.uri,
      type: file.type,
      name: file.name,
    } as any)
    formData.append('transferCode', metadata.transferCode)
    if (metadata.transferDate) {
      formData.append('transferDate', metadata.transferDate)
    }

    const response = await api.post(
      `/payments/transactions/${transactionId}/verify-transfer`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return response.data
  },

  async initiatePsePayment(data: {
    appointmentId: string
    amountCop: number
    bank: string
    userType: 'NATURAL' | 'JURIDICA'
    returnUrl?: string
    idempotencyKey?: string
  }): Promise<{
    paymentUrl: string
    transactionId: string
    bankName?: string
  }> {
    const { idempotencyKey, ...payload } = data
    const response = await api.post(
      '/payments/pse/initiate',
      {
        ...payload,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      {
        headers: idempotencyKey
          ? { 'Idempotency-Key': idempotencyKey }
          : undefined,
      },
    )
    return response.data
  },

  async checkPsePaymentStatus(transactionId: string): Promise<{
    status: Transaction['status']
    transaction?: Transaction
  }> {
    const response = await api.get(`/payments/pse/status/${transactionId}`)
    return response.data
  },

  async getCtgExchangeRate(): Promise<{
    rate: number
    lastUpdated: string
  }> {
    const response = await api.get('/payments/ctg/rate')
    return response.data
  },

  async getCtgRate(): Promise<{ rate: number; lastUpdated: string }> {
    return this.getCtgExchangeRate()
  },

  async requestWithdrawal(data: {
    amountCop: number
    paymentMethod: 'BANK_TRANSFER' | 'NEQUI' | 'DAVIPLATA'
    accountInfo: {
      bankName?: string
      accountNumber?: string
      accountType?: 'SAVINGS' | 'CHECKING'
      phoneNumber?: string
      documentId: string
    }
  }): Promise<WithdrawalResponse> {
    const response = await api.post('/payments/withdrawals', data)
    return response.data
  },

  async getEarningsSummary(filters?: {
    startDate?: string
    endDate?: string
  }): Promise<{
    totalEarnings: number
    totalCommissions: number
    netEarnings: number
    pendingBalance: number
    availableBalance: number
    transactionCount: number
    byTier: {
      tier: 'FREE' | 'PRO' | 'ELITE'
      earnings: number
      commissionPct: number
      commissionAmount: number
    }
  }> {
    const response = await api.get('/payments/me/earnings', { params: filters })
    return response.data
  },
}

export default paymentService
