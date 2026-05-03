import { apiClient } from './api'

export interface AdminMetrics {
  citasHoy: number
  veterinariosActivos: number
  volumenCtgHoy: number
  comisionesHoy: number
}

export interface Transaction {
  id: string
  date: string
  vet: string
  vetId: string
  tier: 'free' | 'pro' | 'elite'
  client: string
  service: string
  amount: number
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
  commission: number
  commissionPct: number
  status: 'LIQUIDADO' | 'VERIFICANDO' | 'DISPUTA' | 'PENDING'
  hash?: string
}

export interface Appointment {
  id: string
  patient: string
  vet: string
  vetId: string
  tier: 'free' | 'pro' | 'elite'
  service: string
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
  commission: number
  status: 'Completada' | 'Verificando' | 'Confirmada' | 'En camino' | 'Pendiente'
  date: string
}

export interface TransferTracking {
  vet: string
  vetId: string
  tier: 'free' | 'pro' | 'elite'
  client: string
  amount: number
  status: 'Confirmada' | 'Pendiente' | 'En disputa'
}

export interface PaymentMethodStats {
  method: 'CTG' | 'PSE' | 'TRANSFER'
  percentage: number
  amount: number
}

class AdminService {
  async getMetrics(): Promise<AdminMetrics> {
    const response = await apiClient.get('/admin/metrics')
    return response.data
  }

  async getAppointments(params?: {
    status?: string
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<Appointment[]> {
    const response = await apiClient.get('/admin/appointments', { params })
    return response.data
  }

  async getTransactions(params?: {
    status?: string
    paymentMethod?: string
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<Transaction[]> {
    const response = await apiClient.get('/admin/transactions', { params })
    return response.data
  }

  async getTransferTracking(): Promise<TransferTracking[]> {
    const response = await apiClient.get('/admin/transfer-tracking')
    return response.data
  }

  async getPaymentMethodStats(period?: string): Promise<PaymentMethodStats[]> {
    const response = await apiClient.get('/admin/payment-stats', {
      params: { period },
    })
    return response.data
  }

  async verifyTransfer(transactionId: string, verified: boolean): Promise<void> {
    await apiClient.post(`/admin/transactions/${transactionId}/verify`, {
      verified,
    })
  }

  async resolveDispute(
    transactionId: string,
    resolution: 'FAVOR_VET' | 'FAVOR_CLIENT' | 'PARTIAL_REFUND',
    notes?: string
  ): Promise<void> {
    await apiClient.post(`/admin/transactions/${transactionId}/resolve-dispute`, {
      resolution,
      notes,
    })
  }

  async getVeterinarians(params?: {
    tier?: 'free' | 'pro' | 'elite'
    isActive?: boolean
    isVerified?: boolean
    limit?: number
  }) {
    const response = await apiClient.get('/admin/veterinarians', { params })
    return response.data
  }

  async updateVetTier(vetId: string, tier: 'free' | 'pro' | 'elite'): Promise<void> {
    await apiClient.patch(`/admin/veterinarians/${vetId}/tier`, { tier })
  }

  async exportTransactions(format: 'csv' | 'xlsx', filters?: any): Promise<Blob> {
    const response = await apiClient.get('/admin/transactions/export', {
      params: { format, ...filters },
      responseType: 'blob',
    })
    return response.data
  }
}

export const adminService = new AdminService()
