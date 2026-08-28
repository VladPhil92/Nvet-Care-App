import { apiClient } from './api'

export type VetTier = 'FREE' | 'PRO' | 'ELITE'
export type VetSortBy =
  | 'relevance'
  | 'rating'
  | 'distance'
  | 'price_asc'
  | 'price_desc'
  | 'experience'

export interface VetUser {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  avatar?: string
}

export interface VetPrice {
  id: string
  serviceName: string
  priceCop: number
  priceCtg: number
  isActive: boolean
}

export interface VetSchedule {
  id?: string
  dayOfWeek?: number
  startTime?: string
  endTime?: string
  isActive?: boolean
  [key: string]: unknown
}

export interface VetReview {
  id: string
  rating: number
  comment?: string
  createdAt?: string
  client?: {
    firstName?: string
    lastName?: string
    avatar?: string
  }
}

/**
 * Shape público canónico devuelto por el backend. Se conservan algunos campos
 * planos opcionales para compatibilidad con componentes legacy durante Fase 1.
 */
export interface Vet {
  id: string
  userId: string
  user?: VetUser
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  avatar?: string
  licenseNumber: string
  specialties: string[]
  tier: VetTier
  rating: number
  reviewCount?: number
  totalReviews?: number
  completedAppointments?: number
  bio?: string
  yearsExperience?: number
  isVerified: boolean
  isActive: boolean
  isAvailableNow?: boolean
  city?: string
  department?: string
  latitude?: number | null
  longitude?: number | null
  distance?: number | null
  prices?: VetPrice[]
  schedules?: VetSchedule[]
  reviews?: VetReview[]
}

export interface VetSearchFilters {
  latitude?: number
  longitude?: number
  radiusKm?: number
  specialty?: string
  tier?: VetTier
  minRating?: number
  availableNow?: boolean
  availableDate?: string
  city?: string
  search?: string
  limit?: number
  offset?: number
  sortBy?: VetSortBy
}

export interface VetSearchResponse {
  results: Vet[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface VetScheduleSlot {
  date: string
  time: string
  available: boolean
}

class VetService {
  async searchVets(filters: VetSearchFilters = {}): Promise<VetSearchResponse> {
    const response = await apiClient.get<VetSearchResponse>('/vets', { params: filters })
    return response.data
  }

  async getVetDetails(vetId: string): Promise<Vet> {
    const response = await apiClient.get<Vet>(`/vets/${vetId}`)
    return response.data
  }

  async getMyProfile(): Promise<Vet> {
    const response = await apiClient.get<Vet>('/vets/me')
    return response.data
  }

  async getVetPrices(vetId: string): Promise<VetPrice[]> {
    const response = await apiClient.get<VetPrice[]>(`/vets/${vetId}/prices`)
    return response.data
  }

  async getVetSchedule(vetId: string, date: string): Promise<VetScheduleSlot[]> {
    const response = await apiClient.get(`/vets/${vetId}/schedule`, {
      params: { date },
    })
    return response.data
  }

  async getMyEarnings(filters?: {
    startDate?: string
    endDate?: string
  }): Promise<{
    totalEarnings: number
    totalCommissions?: number
    commission?: number
    netEarnings: number
    ctgBalance: number
    appointments?: number
    transactionCount?: number
    pendingBalance?: number
    availableBalance?: number
  }> {
    const response = await apiClient.get('/vets/me/earnings', { params: filters })
    return response.data
  }

  async getMyPrices(): Promise<VetPrice[]> {
    const response = await apiClient.get<VetPrice[]>('/vets/me/prices')
    return response.data
  }

  async createPrice(data: {
    serviceName: string
    priceCop: number
    priceCtg: number
  }): Promise<VetPrice> {
    const response = await apiClient.post<VetPrice>('/vets/me/prices', data)
    return response.data
  }

  async updatePrice(
    priceId: string,
    data: Partial<{
      serviceName: string
      priceCop: number
      priceCtg: number
      isActive: boolean
    }>,
  ): Promise<VetPrice> {
    const response = await apiClient.put<VetPrice>(`/vets/me/prices/${priceId}`, data)
    return response.data
  }

  async deletePrice(priceId: string): Promise<void> {
    await apiClient.delete(`/vets/me/prices/${priceId}`)
  }

  async uploadVerificationDocuments(formData: FormData): Promise<{
    status?: 'PENDING' | 'APPROVED' | 'REJECTED'
    message?: string
    [key: string]: unknown
  }> {
    const response = await apiClient.post('/vets/me/verification/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async getVerificationStatus(): Promise<{
    status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
    submittedAt?: string
    reviewedAt?: string
    notes?: string
    [key: string]: unknown
  }> {
    const response = await apiClient.get('/vets/me/verification')
    return response.data
  }

  async getMyScheduleExceptions(startDate: string, endDate: string): Promise<ScheduleException[]> {
    const response = await apiClient.get<ScheduleException[]>('/vets/me/schedule/exceptions', {
      params: { startDate, endDate },
    })
    return response.data
  }

  async upsertScheduleException(
    dateStr: string,
    data: { isAvailable?: boolean; reason?: string },
  ): Promise<ScheduleException> {
    const response = await apiClient.put<ScheduleException>(
      `/vets/me/schedule/exceptions/${dateStr}`,
      data,
    )
    return response.data
  }

  async deleteScheduleException(dateStr: string): Promise<void> {
    await apiClient.delete(`/vets/me/schedule/exceptions/${dateStr}`)
  }
}

export interface ScheduleException {
  id: string
  date: string
  isAvailable: boolean
  reason?: string
  startTime?: string
  endTime?: string
  createdAt: string
}

export const vetService = new VetService()
export default vetService
