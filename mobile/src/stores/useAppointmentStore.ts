import { create } from 'zustand';
import appointmentService from '../services/appointment.service';

interface Appointment {
  id: string;
  vetId: string;
  clientId: string;
  petId: string;
  serviceType: string;
  date: string;
  time: string;
  status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER';
  amountCop: number;
  amountCtg?: number;
  address: string;
  notes?: string;
  clinicalNotes?: string;
  createdAt: string;
  updatedAt: string;
  vet?: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    tier: 'FREE' | 'PRO' | 'ELITE';
    rating: number;
  };
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  pet?: {
    id: string;
    name: string;
    species: string;
    breed: string;
    photo?: string;
  };
}

interface AppointmentTracking {
  appointmentId: string;
  currentStatus: string;
  vetLocation?: {
    lat: number;
    lng: number;
  };
  estimatedArrival?: string;
  statusHistory: Array<{
    status: string;
    timestamp: string;
  }>;
}

interface AppointmentState {
  appointments: Appointment[];
  selectedAppointment: Appointment | null;
  tracking: AppointmentTracking | null;
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  error: string | null;

  // Actions
  fetchAppointments: (filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  fetchAppointmentById: (id: string) => Promise<void>;
  createAppointment: (data: {
    vetId: string;
    petId: string;
    serviceType: string;
    date: string;
    time: string;
    paymentMethod: 'CTG' | 'PSE' | 'TRANSFER';
    address: string;
    notes?: string;
  }) => Promise<Appointment>;
  updateAppointment: (id: string, data: Partial<Appointment>) => Promise<void>;
  cancelAppointment: (id: string, reason?: string) => Promise<void>;
  fetchTracking: (id: string) => Promise<void>;
  updateStatus: (id: string, status: string) => Promise<void>;
  addClinicalNotes: (id: string, notes: string) => Promise<void>;
  getTodayAppointments: () => Promise<void>;
  clearError: () => void;
  clearSelectedAppointment: () => void;
}

export const useAppointmentStore = create<AppointmentState>((set, get) => ({
  appointments: [],
  selectedAppointment: null,
  tracking: null,
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  error: null,

  fetchAppointments: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const appointments = await appointmentService.getAppointments(filters);
      set({ appointments, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar las citas',
        isLoading: false,
      });
    }
  },

  fetchAppointmentById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const appointment = await appointmentService.getAppointmentById(id);
      set({ selectedAppointment: appointment, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar la cita',
        isLoading: false,
      });
    }
  },

  createAppointment: async (data) => {
    set({ isCreating: true, error: null });
    try {
      const newAppointment = await appointmentService.createAppointment(data);
      set((state) => ({
        appointments: [newAppointment, ...state.appointments],
        isCreating: false,
      }));
      return newAppointment;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al crear la cita',
        isCreating: false,
      });
      throw error;
    }
  },

  updateAppointment: async (id: string, data: Partial<Appointment>) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedAppointment = await appointmentService.updateAppointment(id, data);
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt.id === id ? updatedAppointment : apt
        ),
        selectedAppointment:
          state.selectedAppointment?.id === id
            ? updatedAppointment
            : state.selectedAppointment,
        isUpdating: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al actualizar la cita',
        isUpdating: false,
      });
      throw error;
    }
  },

  cancelAppointment: async (id: string, reason?: string) => {
    set({ isUpdating: true, error: null });
    try {
      await appointmentService.cancelAppointment(id, reason);
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt.id === id ? { ...apt, status: 'CANCELLED' as const } : apt
        ),
        selectedAppointment:
          state.selectedAppointment?.id === id
            ? { ...state.selectedAppointment, status: 'CANCELLED' as const }
            : state.selectedAppointment,
        isUpdating: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cancelar la cita',
        isUpdating: false,
      });
      throw error;
    }
  },

  fetchTracking: async (id: string) => {
    set({ error: null });
    try {
      const tracking = await appointmentService.getAppointmentTracking(id);
      set({ tracking });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar el seguimiento',
      });
    }
  },

  updateStatus: async (id: string, status: string) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedAppointment = await appointmentService.updateAppointmentStatus(id, status);
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt.id === id ? updatedAppointment : apt
        ),
        selectedAppointment:
          state.selectedAppointment?.id === id
            ? updatedAppointment
            : state.selectedAppointment,
        isUpdating: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al actualizar el estado',
        isUpdating: false,
      });
      throw error;
    }
  },

  addClinicalNotes: async (id: string, notes: string) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedAppointment = await appointmentService.addClinicalNotes(id, notes);
      set((state) => ({
        appointments: state.appointments.map((apt) =>
          apt.id === id ? updatedAppointment : apt
        ),
        selectedAppointment:
          state.selectedAppointment?.id === id
            ? updatedAppointment
            : state.selectedAppointment,
        isUpdating: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al guardar las notas clínicas',
        isUpdating: false,
      });
      throw error;
    }
  },

  getTodayAppointments: async () => {
    set({ isLoading: true, error: null });
    try {
      const appointments = await appointmentService.getTodayAppointments();
      set({ appointments, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar las citas de hoy',
        isLoading: false,
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  clearSelectedAppointment: () => {
    set({ selectedAppointment: null, tracking: null });
  },
}));
