import { apiClient } from './api'

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'

export type PaymentMethod = 'CTG' | 'PSE' | 'TRANSFER'

export interface Appointment {
  id: string
  vetId: string
  vet: {
    id: string
    firstName: string
    lastName: string
    tier: 'FREE' | 'PRO' | 'ELITE'
    rating: number
    avatar?: string
  }
  clientId: string
  client: {
    id: string
    firstName: string
    lastName: string
  }
  petId: string
  pet: {
    id: string
    name: string
    species: string
    photo?: string
  }
  serviceType: string
  date: string
  time: string
  address: string
  status: AppointmentStatus
  paymentMethod: PaymentMethod
  amount: number
  notes?: string
  diagnosis?: string
  treatment?: string
  createdAt: string
  updatedAt: string
}

export interface CreateAppointmentData {
  vetId: string
  petId: string
  serviceType: string
  date: string
  time: string
  address: string
  paymentMethod: PaymentMethod
  amount: number
  /** Monto en CTG si el cliente paga con saldo CTG (opcional). */
  amountCtg?: number
  notes?: string
  /**
   * Idempotency key generada por el cliente (UUID v4) para deduplicar
   * intentos de booking repetidos en redes inestables.
   */
  idempotencyKey?: string
}

export interface AppointmentTracking {
  appointmentId: string
  status: AppointmentStatus
  progress: number // 0-100
  eta?: string
  location?: {
    lat: number
    lng: number
  }
  timeline: Array<{
    status: AppointmentStatus
    timestamp: string
    completed: boolean
  }>
}

class AppointmentService {
  async getAppointments(filters?: {
    status?: AppointmentStatus
    startDate?: string
    endDate?: string
  }): Promise<Appointment[]> {
    const response = await apiClient.get('/appointments', { params: filters })
    return response.data
  }

  async getAppointmentById(appointmentId: string): Promise<Appointment> {
    const response = await apiClient.get(`/appointments/${appointmentId}`)
    return response.data
  }

  async createAppointment(data: CreateAppointmentData): Promise<Appointment> {
    const { idempotencyKey, ...payload } = data
    const response = await apiClient.post('/appointments', payload, {
      headers: idempotencyKey
        ? { 'Idempotency-Key': idempotencyKey }
        : undefined,
    })
    return response.data
  }

  async updateAppointment(
    appointmentId: string,
    data: Partial<{
      status: AppointmentStatus
      diagnosis: string
      treatment: string
      notes: string
    }>
  ): Promise<Appointment> {
    const response = await apiClient.patch(`/appointments/${appointmentId}`, data)
    return response.data
  }

  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    await apiClient.delete(`/appointments/${appointmentId}`, {
      data: { reason },
    })
  }

  async getAppointmentTracking(appointmentId: string): Promise<AppointmentTracking> {
    const response = await apiClient.get(`/appointments/${appointmentId}/tracking`)
    return response.data
  }

  // Métodos específicos para veterinarios
  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus
  ): Promise<Appointment> {
    const response = await apiClient.patch(`/appointments/${appointmentId}/status`, {
      status,
    })
    return response.data
  }

  async addClinicalNotes(
    appointmentId: string,
    data: {
      diagnosis: string
      treatment: string
      notes?: string
    }
  ): Promise<Appointment> {
    const response = await apiClient.post(`/appointments/${appointmentId}/clinical-notes`, data)
    return response.data
  }

  async getTodayAppointments(): Promise<Appointment[]> {
    const today = new Date().toISOString().split('T')[0]
    return this.getAppointments({
      startDate: today,
      endDate: today,
    })
  }

  async getUpcomingAppointments(): Promise<Appointment[]> {
    const today = new Date().toISOString().split('T')[0]
    return this.getAppointments({
      startDate: today,
      status: 'CONFIRMED',
    })
  }
}

export const appointmentService = new AppointmentService()
export default appointmentService
