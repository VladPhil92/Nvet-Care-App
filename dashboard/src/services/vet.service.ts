import { apiClient, dedupedGet } from './api'

export interface VetUserSummary {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  avatar?: string
}

export interface VetPrice {
  id: string
  serviceName: string
  priceCop: number
  priceCtg?: number | null
  isActive: boolean
}

export interface VetSchedule {
  id: string
  dayOfWeek: string
  startTime: string
  endTime: string
  slotDuration: number
  isActive: boolean
}

export interface VerificationDocument {
  id: string
  type: string
  status: string
  fileName: string
  uploadedAt: string
  expiryDate?: string | null
}

export interface VetProfile {
  id: string
  userId: string
  licenseNumber: string
  specialties: string[]
  tier: 'FREE' | 'PRO' | 'ELITE'
  ctgBalance: number
  bio?: string | null
  yearsExperience?: number | null
  rating?: number | null
  reviewCount: number
  isVerified: boolean
  isActive: boolean
  verificationStatus: string
  city?: string | null
  department?: string | null
  serviceRadius: number
  isAvailableNow: boolean
  timezone: string
  user: VetUserSummary
  prices?: VetPrice[]
  schedules?: VetSchedule[]
  verificationDocuments?: VerificationDocument[]
}

export interface VetEarnings {
  totalEarnings: number
  totalCommissions: number
  netEarnings: number
  totalCtg: number
  pendingBalance: number
  availableBalance: number
  transactionCount: number
  ctgBalance: number
  byTier: {
    tier: string
    commissionPct: number
    commissionAmount: number
    earnings: number
  }
  byMonth: unknown[]
}

export interface VetAppointment {
  id: string
  vetId: string
  clientId: string
  petId: string
  serviceType: string
  date: string
  time: string
  address: string
  status: string
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
  amount: number
  notes?: string | null
  diagnosis?: string | null
  treatment?: string | null
  client?: VetUserSummary
  pet?: {
    id: string
    name: string
    species: string
    breed?: string | null
    weight?: number | null
  }
}

export interface VetVerificationStatus {
  verificationStatus: string
  isVerified: boolean
  verifiedAt?: string | null
  rejectionReason?: string | null
  documents?: VerificationDocument[]
  [key: string]: unknown
}

export interface VetChatSummary {
  appointmentId?: string
  id?: string
  status?: string
  unreadCount?: number
  pet?: { name?: string }
  client?: VetUserSummary
  appointment?: {
    id?: string
    status?: string
    pet?: { name?: string }
    client?: VetUserSummary
  }
  [key: string]: unknown
}

export interface ScheduleException {
  id: string
  date: string
  isAvailable: boolean
  reason?: string | null
  startTime?: string | null
  endTime?: string | null
}

class VetService {
  getProfile(): Promise<VetProfile> {
    return dedupedGet<VetProfile>('/vets/me')
  }

  getEarnings(params: { startDate?: string; endDate?: string } = {}): Promise<VetEarnings> {
    return dedupedGet<VetEarnings>('/vets/me/earnings', params)
  }

  getAppointments(params: { status?: string; startDate?: string; endDate?: string } = {}): Promise<VetAppointment[]> {
    return dedupedGet<VetAppointment[]>('/appointments', params)
  }

  getTodayAppointments(): Promise<VetAppointment[]> {
    return dedupedGet<VetAppointment[]>('/appointments/today')
  }

  getPrices(activeOnly = false): Promise<VetPrice[]> {
    return dedupedGet<VetPrice[]>('/vets/me/prices', { activeOnly: String(activeOnly) })
  }

  getVerification(): Promise<VetVerificationStatus> {
    return dedupedGet<VetVerificationStatus>('/vets/me/verification')
  }

  getActiveChats(): Promise<VetChatSummary[]> {
    return dedupedGet<VetChatSummary[]>('/chat/active')
  }

  getScheduleExceptions(startDate: string, endDate: string): Promise<ScheduleException[]> {
    return dedupedGet<ScheduleException[]>('/vets/me/schedule/exceptions', { startDate, endDate })
  }

  async toggleAvailability(): Promise<VetProfile> {
    const response = await apiClient.post<VetProfile>('/vets/me/availability/toggle')
    return response.data
  }

  async updateAppointmentStatus(appointmentId: string, status: string): Promise<VetAppointment> {
    const response = await apiClient.patch<VetAppointment>(`/appointments/${appointmentId}/status`, { status })
    return response.data
  }

  async addClinicalNotes(appointmentId: string, diagnosis: string, treatment: string): Promise<VetAppointment> {
    const response = await apiClient.post<VetAppointment>(`/appointments/${appointmentId}/clinical-notes`, {
      diagnosis,
      treatment,
    })
    return response.data
  }

  async createPrice(input: { serviceName: string; priceCop: number; priceCtg?: number }): Promise<VetPrice> {
    const response = await apiClient.post<VetPrice>('/vets/me/prices', input)
    return response.data
  }

  async updatePrice(priceId: string, input: Partial<Pick<VetPrice, 'serviceName' | 'priceCop' | 'priceCtg' | 'isActive'>>): Promise<VetPrice> {
    const response = await apiClient.put<VetPrice>(`/vets/me/prices/${priceId}`, input)
    return response.data
  }

  async deletePrice(priceId: string): Promise<void> {
    await apiClient.delete(`/vets/me/prices/${priceId}`)
  }

  async upsertScheduleException(
    date: string,
    input: { isAvailable?: boolean; reason?: string; startTime?: string; endTime?: string },
  ): Promise<ScheduleException> {
    const response = await apiClient.put<ScheduleException>(`/vets/me/schedule/exceptions/${date}`, input)
    return response.data
  }

  async deleteScheduleException(date: string): Promise<void> {
    await apiClient.delete(`/vets/me/schedule/exceptions/${date}`)
  }

  async sendChatMessage(appointmentId: string, content: string): Promise<unknown> {
    const response = await apiClient.post(`/chat/${appointmentId}/messages`, { content })
    return response.data
  }
}

export const vetService = new VetService()
