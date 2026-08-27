import { create } from 'zustand'
import appointmentService, {
  Appointment,
  AppointmentStatus,
  AppointmentTracking,
  CreateAppointmentData,
} from '../services/appointment.service'

interface AppointmentState {
  appointments: Appointment[]
  selectedAppointment: Appointment | null
  tracking: AppointmentTracking | null
  isLoading: boolean
  isCreating: boolean
  isUpdating: boolean
  error: string | null

  fetchAppointments: (filters?: {
    status?: AppointmentStatus
    startDate?: string
    endDate?: string
  }) => Promise<void>
  fetchAppointmentById: (id: string) => Promise<void>
  createAppointment: (data: CreateAppointmentData) => Promise<Appointment>
  updateAppointment: (
    id: string,
    data: Partial<Pick<Appointment, 'date' | 'time' | 'address' | 'notes'>>,
  ) => Promise<void>
  cancelAppointment: (id: string, reason?: string) => Promise<void>
  fetchTracking: (id: string) => Promise<void>
  updateStatus: (id: string, status: AppointmentStatus) => Promise<void>
  addClinicalNotes: (
    id: string,
    data: { diagnosis: string; treatment: string; notes?: string },
  ) => Promise<void>
  getTodayAppointments: () => Promise<void>
  clearError: () => void
  clearSelectedAppointment: () => void
}

export const useAppointmentStore = create<AppointmentState>((set) => ({
  appointments: [],
  selectedAppointment: null,
  tracking: null,
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  error: null,

  fetchAppointments: async (filters) => {
    set({ isLoading: true, error: null })
    try {
      const appointments = await appointmentService.getAppointments(filters)
      set({ appointments, isLoading: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar las citas',
        isLoading: false,
      })
    }
  },

  fetchAppointmentById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const appointment = await appointmentService.getAppointmentById(id)
      set({ selectedAppointment: appointment, isLoading: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar la cita',
        isLoading: false,
      })
    }
  },

  createAppointment: async (data) => {
    set({ isCreating: true, error: null })
    try {
      const newAppointment = await appointmentService.createAppointment(data)
      set((state) => ({
        appointments: [newAppointment, ...state.appointments],
        isCreating: false,
      }))
      return newAppointment
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al crear la cita',
        isCreating: false,
      })
      throw error
    }
  },

  updateAppointment: async (id, data) => {
    set({ isUpdating: true, error: null })
    try {
      const updatedAppointment = await appointmentService.updateAppointment(id, data)
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt.id === id ? updatedAppointment : apt,
        ),
        selectedAppointment:
          state.selectedAppointment?.id === id
            ? updatedAppointment
            : state.selectedAppointment,
        isUpdating: false,
      }))
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al actualizar la cita',
        isUpdating: false,
      })
      throw error
    }
  },

  cancelAppointment: async (id, reason) => {
    set({ isUpdating: true, error: null })
    try {
      await appointmentService.cancelAppointment(id, reason)
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt.id === id ? { ...apt, status: 'CANCELLED' as const } : apt,
        ),
        selectedAppointment:
          state.selectedAppointment?.id === id
            ? { ...state.selectedAppointment, status: 'CANCELLED' as const }
            : state.selectedAppointment,
        isUpdating: false,
      }))
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cancelar la cita',
        isUpdating: false,
      })
      throw error
    }
  },

  fetchTracking: async (id) => {
    set({ error: null })
    try {
      const tracking = await appointmentService.getAppointmentTracking(id)
      set({ tracking })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar el seguimiento',
      })
    }
  },

  updateStatus: async (id, status) => {
    set({ isUpdating: true, error: null })
    try {
      const updatedAppointment = await appointmentService.updateAppointmentStatus(id, status)
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt.id === id ? updatedAppointment : apt,
        ),
        selectedAppointment:
          state.selectedAppointment?.id === id
            ? updatedAppointment
            : state.selectedAppointment,
        isUpdating: false,
      }))
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al actualizar el estado',
        isUpdating: false,
      })
      throw error
    }
  },

  addClinicalNotes: async (id, data) => {
    set({ isUpdating: true, error: null })
    try {
      const updatedAppointment = await appointmentService.addClinicalNotes(id, data)
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt.id === id ? updatedAppointment : apt,
        ),
        selectedAppointment:
          state.selectedAppointment?.id === id
            ? updatedAppointment
            : state.selectedAppointment,
        isUpdating: false,
      }))
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al guardar las notas clínicas',
        isUpdating: false,
      })
      throw error
    }
  },

  getTodayAppointments: async () => {
    set({ isLoading: true, error: null })
    try {
      const appointments = await appointmentService.getTodayAppointments()
      set({ appointments, isLoading: false })
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar las citas de hoy',
        isLoading: false,
      })
    }
  },

  clearError: () => set({ error: null }),
  clearSelectedAppointment: () =>
    set({ selectedAppointment: null, tracking: null }),
}))
