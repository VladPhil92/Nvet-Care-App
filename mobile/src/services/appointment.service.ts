import { apiClient } from './api'

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'

export type PaymentMethod = 'CTG' | 'PSE' | 'TRANSFER'

export interface AppointmentVet {
  id: string
  userId?: string
  user?: {
    id?: string
    firstName?: string
    lastName?: string
    avatar?: string
    phone?: string
    email?: string
  }
  firstName?: string
  lastName?: string
  tier: 'FREE' | 'PRO' | 'ELITE'
  rating: number
  reviewCount?: number
  avatar?: string
  phone?: string
}

export interface Appointment {
  id: string
  vetId: string
  vet: AppointmentVet
  clientId: string
  client: {
    id: string
    firstName: string
    lastName: string
    avatar?: string
  }
  petId: string
  pet: {
    id: string
    name: string
    species: string
    breed?: string
    photo?: string
  }
  serviceType: string
  /** Alias normalizado para componentes de presentación legacy. */
  serviceName: string
  date: string
  time: string
  /** ISO compuesto a partir de date + time cuando el backend no lo envía. */
  scheduledAt: string
  address: string
  status: AppointmentStatus
  paymentMethod: PaymentMethod
  amount: number
  /** Alias del monto COP usado por stores legacy. */
  amountCop: number
  amountCtg?: number
  notes?: string
  diagnosis?: string
  treatment?: string
  clinicalNotes?: string
  createdAt: string
  updatedAt: string
  transaction?: unknown
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
  amountCtg?: number
  notes?: string
  idempotencyKey?: string
}

export interface AppointmentTracking {
  appointmentId: string
  /** Shape canónico del backend. */
  currentStatus: AppointmentStatus
  vetLocation?: {
    lat: number
    lng: number
  } | null
  estimatedArrival?: string | null
  statusHistory: Array<{
    status: AppointmentStatus | string
    timestamp: string
  }>
  /** Campos de compatibilidad para la UI de tracking existente. */
  status?: AppointmentStatus
  progress?: number
  eta?: string
  location?: {
    lat: number
    lng: number
  }
  timeline?: Array<{
    status: AppointmentStatus
    timestamp: string
    completed: boolean
  }>
  vet?: AppointmentVet
  etaMinutes?: number | null
  lastStatusChangeAt?: string
  scheduledAt?: string
}

function toScheduledAt(date: unknown, time: unknown): string {
  const rawDate = typeof date === 'string' ? date : new Date(String(date)).toISOString()
  const datePart = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate
  const timePart = typeof time === 'string' && time ? time : '00:00'
  const candidate = `${datePart}T${timePart}`
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? rawDate : parsed.toISOString()
}

function normalizeAppointment(raw: any): Appointment {
  const vetUser = raw?.vet?.user ?? {}
  const vet: AppointmentVet = {
    ...(raw?.vet ?? {}),
    firstName: raw?.vet?.firstName ?? vetUser.firstName,
    lastName: raw?.vet?.lastName ?? vetUser.lastName,
    avatar: raw?.vet?.avatar ?? vetUser.avatar,
    tier: raw?.vet?.tier ?? 'FREE',
    rating: Number(raw?.vet?.rating ?? 0),
    reviewCount: raw?.vet?.reviewCount ?? raw?.vet?.totalReviews,
  }

  const amount = Number(raw?.amount ?? raw?.amountCop ?? 0)

  return {
    ...raw,
    vet,
    serviceType: raw?.serviceType ?? raw?.serviceName ?? '',
    serviceName: raw?.serviceName ?? raw?.serviceType ?? '',
    date: typeof raw?.date === 'string' ? raw.date : String(raw?.date ?? ''),
    time: raw?.time ?? '',
    scheduledAt: raw?.scheduledAt ?? toScheduledAt(raw?.date, raw?.time),
    amount,
    amountCop: Number(raw?.amountCop ?? amount),
  } as Appointment
}

class AppointmentService {
  async getAppointments(filters?: {
    status?: AppointmentStatus
    startDate?: string
    endDate?: string
  }): Promise<Appointment[]> {
    const response = await apiClient.get('/appointments', { params: filters })
    return (response.data as any[]).map(normalizeAppointment)
  }

  async getAppointmentById(appointmentId: string): Promise<Appointment> {
    const response = await apiClient.get(`/appointments/${appointmentId}`)
    return normalizeAppointment(response.data)
  }

  async createAppointment(data: CreateAppointmentData): Promise<Appointment> {
    const { idempotencyKey, ...payload } = data
    const response = await apiClient.post('/appointments', payload, {
      headers: idempotencyKey
        ? { 'Idempotency-Key': idempotencyKey }
        : undefined,
    })
    return normalizeAppointment(response.data)
  }

  async updateAppointment(
    appointmentId: string,
    data: Partial<{
      date: string
      time: string
      address: string
      notes: string
    }>,
  ): Promise<Appointment> {
    const response = await apiClient.patch(`/appointments/${appointmentId}`, data)
    return normalizeAppointment(response.data)
  }

  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    await apiClient.delete(`/appointments/${appointmentId}`, {
      data: { reason },
    })
  }

  async getAppointmentTracking(appointmentId: string): Promise<AppointmentTracking> {
    const response = await apiClient.get(`/appointments/${appointmentId}/tracking`)
    const raw = response.data as any
    return {
      ...raw,
      appointmentId: raw.appointmentId ?? appointmentId,
      currentStatus: raw.currentStatus ?? raw.status ?? 'PENDING',
      status: raw.status ?? raw.currentStatus,
      vetLocation: raw.vetLocation ?? raw.location ?? null,
      location: raw.location ?? raw.vetLocation ?? undefined,
      estimatedArrival: raw.estimatedArrival ?? raw.eta ?? null,
      statusHistory: raw.statusHistory ?? raw.timeline ?? [],
      timeline:
        raw.timeline ??
        (raw.statusHistory ?? []).map((item: any) => ({
          ...item,
          completed: true,
        })),
    }
  }

  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
  ): Promise<Appointment> {
    const response = await apiClient.patch(`/appointments/${appointmentId}/status`, {
      status,
    })
    return normalizeAppointment(response.data)
  }

  async addClinicalNotes(
    appointmentId: string,
    data: {
      diagnosis: string
      treatment: string
      notes?: string
    },
  ): Promise<Appointment> {
    const response = await apiClient.post(
      `/appointments/${appointmentId}/clinical-notes`,
      data,
    )
    return normalizeAppointment(response.data)
  }

  async getTodayAppointments(): Promise<Appointment[]> {
    const response = await apiClient.get('/appointments/today')
    return (response.data as any[]).map(normalizeAppointment)
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
