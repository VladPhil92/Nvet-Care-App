import { apiClient } from './api'

export interface Vet {
  id: string
  userId: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  avatar?: string
  licenseNumber: string
  specialties: string[]
  tier: 'FREE' | 'PRO' | 'ELITE'
  rating: number
  reviewCount: number
  bio?: string
  yearsExperience?: number
  isVerified: boolean
  isActive: boolean
}

export interface VetPrice {
  id: string
  serviceName: string
  priceCop: number
  priceCtg: number
  isActive: boolean
}

export interface VetSearchFilters {
  specialty?: string
  tier?: 'FREE' | 'PRO' | 'ELITE'
  minRating?: number
  location?: string
  limit?: number
  offset?: number
}

export interface VetScheduleSlot {
  date: string
  time: string
  available: boolean
}

class VetService {
  async searchVets(filters?: VetSearchFilters): Promise<Vet[]> {
    const response = await apiClient.get('/vets', { params: filters })
    return response.data
  }

  async getVetDetails(vetId: string): Promise<Vet> {
    const response = await apiClient.get(`/vets/${vetId}`)
    return response.data
  }

  async getVetPrices(vetId: string): Promise<VetPrice[]> {
    const response = await apiClient.get(`/vets/${vetId}/prices`)
    return response.data
  }

  async getVetSchedule(vetId: string, date: string): Promise<VetScheduleSlot[]> {
    const response = await apiClient.get(`/vets/${vetId}/schedule`, {
      params: { date },
    })
    return response.data
  }

  // Métodos para veterinarios autenticados
  async getMyEarnings(period?: 'today' | 'week' | 'month'): Promise<{
    totalEarnings: number
    commission: number
    netEarnings: number
    ctgBalance: number
    appointments: number
  }> {
    const response = await apiClient.get('/vets/me/earnings', {
      params: { period },
    })
    return response.data
  }

  async getMyPrices(): Promise<VetPrice[]> {
    const response = await apiClient.get('/vets/me/prices')
    return response.data
  }

  async createPrice(data: {
    serviceName: string
    priceCop: number
    priceCtg: number
  }): Promise<VetPrice> {
    const response = await apiClient.post('/vets/prices', data)
    return response.data
  }

  async updatePrice(
    priceId: string,
    data: Partial<{ serviceName: string; priceCop: number; priceCtg: number; isActive: boolean }>
  ): Promise<VetPrice> {
    const response = await apiClient.put(`/vets/prices/${priceId}`, data)
    return response.data
  }

  async deletePrice(priceId: string): Promise<void> {
    await apiClient.delete(`/vets/prices/${priceId}`)
  }

  async uploadVerificationDocuments(formData: FormData): Promise<{
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    message: string
  }> {
    const response = await apiClient.post('/vets/verification/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  }

  async getVerificationStatus(): Promise<{
    status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
    submittedAt?: string
    reviewedAt?: string
    notes?: string
  }> {
    const response = await apiClient.get('/vets/verification/status')
    return response.data
  }
}

export const vetService = new VetService()
export default vetService
