import { apiClient } from './api'

export interface MetricsFilters {
  startDate?: string
  endDate?: string
}

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
  id?: string
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

export interface TransactionFilters {
  status?: string
  paymentMethod?: string
  startDate?: string
  endDate?: string
  vetName?: string
  limit?: number
  offset?: number
}

export interface AppointmentFilters {
  status?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export interface VeterinarianFilters {
  tier?: string
  verificationStatus?: string
  search?: string
  isActive?: boolean
  isVerified?: boolean
  limit?: number
  offset?: number
}

export type DisputeResolution = 'CONFIRM' | 'REFUND' | 'CANCEL'
export type VetTierInput = 'free' | 'pro' | 'elite' | 'FREE' | 'PRO' | 'ELITE'
export type ExportFormat = 'csv' | 'xlsx' | 'CSV' | 'XLSX'

class AdminService {
  async getMetrics(filters: MetricsFilters = {}): Promise<AdminMetrics> {
    const response = await apiClient.get<AdminMetrics>('/admin/metrics', { params: filters })
    return response.data
  }

  async getAppointments(params: AppointmentFilters = {}): Promise<Appointment[]> {
    const response = await apiClient.get<Appointment[]>('/admin/appointments', { params })
    return response.data
  }

  async getTransactions(params: TransactionFilters = {}): Promise<Transaction[]> {
    const response = await apiClient.get<Transaction[]>('/admin/transactions', { params })
    return response.data
  }

  async getTransferTracking(): Promise<TransferTracking[]> {
    const response = await apiClient.get<TransferTracking[]>('/admin/transfer-tracking')
    return response.data
  }

  async getPaymentMethodStats(
    filters: MetricsFilters | string = {},
  ): Promise<PaymentMethodStats[]> {
    const params = typeof filters === 'string' ? { period: filters } : filters
    const response = await apiClient.get<PaymentMethodStats[]>('/admin/payment-stats', { params })
    return response.data
  }

  /**
   * Compatibilidad con la UI legacy. El endpoint se mantiene encapsulado aquí
   * para que una futura migración a la máquina de estados de disputas no se
   * propague a los componentes.
   */
  async verifyTransfer(
    transactionId: string,
    verification: boolean | { action: 'CONFIRM' | 'REJECT'; reason?: string },
  ): Promise<void> {
    const payload =
      typeof verification === 'boolean'
        ? { verified: verification }
        : verification
    await apiClient.post(`/admin/transactions/${transactionId}/verify`, payload)
  }

  async resolveDispute(
    transactionId: string,
    resolution: DisputeResolution,
    notes = '',
  ): Promise<void> {
    await apiClient.post(`/admin/transactions/${transactionId}/resolve-dispute`, {
      resolution,
      notes,
    })
  }

  async getVeterinarians(params: VeterinarianFilters = {}) {
    const normalized = {
      ...params,
      tier: params.tier?.toUpperCase(),
    }
    const response = await apiClient.get('/admin/veterinarians', { params: normalized })
    return response.data
  }

  async updateVetTier(vetId: string, tier: VetTierInput, reason?: string): Promise<void> {
    await apiClient.patch(`/admin/veterinarians/${vetId}/tier`, {
      tier: tier.toUpperCase(),
      ...(reason ? { reason } : {}),
    })
  }

  async exportTransactions(
    format: ExportFormat,
    filters: TransactionFilters = {},
  ): Promise<Blob> {
    const response = await apiClient.get('/admin/exports/transactions', {
      params: { format: format.toUpperCase(), ...filters },
      responseType: 'blob',
    })
    return response.data
  }
}

export const adminService = new AdminService()
export default adminService
