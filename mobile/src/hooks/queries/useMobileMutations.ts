import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk, invalidateAfterBooking } from '../../lib/queryKeys'
import appointmentService from '../../services/appointment.service'
import paymentService from '../../services/payment.service'
import authService from '../../services/auth.service'
import petService, { CreatePetData, Pet } from '../../services/pet.service'
import vetService from '../../services/vet.service'

/**
 * Mutations de la app móvil con optimistic updates para UX instantánea.
 *
 * Crítico en mobile: las redes pueden ser lentas o intermitentes.
 * El patrón de optimistic update + rollback minimiza la sensación de lag.
 */

// ============================================================
// AUTH
// ============================================================

interface LoginVars {
  email: string
  password: string
}

export function useLoginMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['auth', 'login'],
    mutationFn: ({ email, password }: LoginVars) =>
      authService.login({ email, password }),

    onSuccess: (data) => {
      qc.setQueryData(qk.auth.me(), data.user)
      qc.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] !== 'auth',
      })
    },
  })
}

export function useLogoutMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['auth', 'logout'],
    mutationFn: () => authService.logout(),
    onSuccess: () => qc.clear(),
    onError: () => qc.clear(),
  })
}

// ============================================================
// APPOINTMENTS - book new
// ============================================================

interface BookAppointmentVars {
  vetId: string
  petId: string
  serviceType: string
  date: string
  time: string
  address: string
  amount: number
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
  amountCtg?: number
  notes?: string
  /** UUID v4 generado por la pantalla; deduplica reintentos en redes inestables. */
  idempotencyKey?: string
}

export function useBookAppointmentMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['appointments', 'book'],
    mutationFn: (vars: BookAppointmentVars) =>
      appointmentService.createAppointment(vars),

    onSuccess: async (newAppointment: any) => {
      // Prime el cache con el nuevo appointment
      qc.setQueryData(qk.appointments.detail(newAppointment.id), newAppointment)
      await invalidateAfterBooking(qc, newAppointment.id)
    },
  })
}

// ============================================================
// APPOINTMENTS - cancel
// ============================================================

interface CancelAppointmentVars {
  id: string
  reason?: string
}

export function useCancelAppointmentMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['appointments', 'cancel'],
    mutationFn: ({ id, reason }: CancelAppointmentVars) =>
      appointmentService.cancelAppointment(id, reason),

    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: qk.appointments.all })

      const previousLists = qc.getQueriesData({ queryKey: qk.appointments.all })
      const previousDetail = qc.getQueryData(qk.appointments.detail(id))

      // Optimistic update: marcar como CANCELLED en la lista
      qc.setQueriesData(
        { queryKey: qk.appointments.all },
        (old: any) => {
          if (!Array.isArray(old)) return old
          return old.map((apt: any) =>
            apt.id === id
              ? { ...apt, status: 'CANCELLED', _optimistic: true }
              : apt,
          )
        },
      )

      // En el detalle también
      if (previousDetail) {
        qc.setQueryData(qk.appointments.detail(id), {
          ...(previousDetail as any),
          status: 'CANCELLED',
          _optimistic: true,
        })
      }

      return { previousLists, previousDetail, id }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          qc.setQueryData(key, data)
        }
      }
      if (context?.previousDetail) {
        qc.setQueryData(qk.appointments.detail(context.id), context.previousDetail)
      }
    },

    onSettled: async (_data, _err, vars) => {
      await invalidateAfterBooking(qc, vars?.id)
    },
  })
}

// ============================================================
// APPOINTMENTS - update status (vet)
// ============================================================

interface UpdateStatusVars {
  id: string
  status: string
}

export function useUpdateAppointmentStatusMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['appointments', 'updateStatus'],
    mutationFn: ({ id, status }: UpdateStatusVars) =>
      appointmentService.updateAppointmentStatus(id, status),

    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: qk.appointments.all })

      const snapshots = qc.getQueriesData({ queryKey: qk.appointments.all })

      // Update optimista en todas las listas que contengan este appointment
      qc.setQueriesData({ queryKey: qk.appointments.all }, (old: any) => {
        if (!Array.isArray(old)) {
          if (old?.id === id) return { ...old, status, _optimistic: true }
          return old
        }
        return old.map((apt: any) =>
          apt.id === id ? { ...apt, status, _optimistic: true } : apt,
        )
      })

      return { snapshots }
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          qc.setQueryData(key, data)
        }
      }
    },

    onSettled: async (_data, _err, vars) => {
      await qc.invalidateQueries({ queryKey: qk.appointments.all })
      if (vars?.id) {
        await qc.invalidateQueries({
          queryKey: qk.appointments.detail(vars.id),
        })
      }
    },
  })
}

// ============================================================
// PAYMENTS - process payment
// ============================================================

interface ProcessPaymentVars {
  appointmentId: string
  paymentMethod: 'CTG' | 'PSE' | 'TRANSFER'
  amountCop: number
  amountCtg?: number
  /** Idempotency key generada por el cliente (UUID v4 recomendado) */
  idempotencyKey?: string
}

export function useProcessPaymentMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['payments', 'process'],
    mutationFn: (vars: ProcessPaymentVars) => paymentService.processPayment(vars),

    onSuccess: async (_data, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.payments.balance() }),
        qc.invalidateQueries({ queryKey: qk.payments.all }),
        qc.invalidateQueries({
          queryKey: qk.appointments.detail(vars.appointmentId),
        }),
        qc.invalidateQueries({ queryKey: qk.appointments.all }),
      ])
    },
  })
}

// ============================================================
// PAYMENTS - verify transfer (vet sube comprobante)
// ============================================================

interface VerifyTransferVars {
  transactionId: string
  file: { uri: string; name: string; type: string }
  transferCode: string
  transferDate?: string
}

export function useVerifyTransferMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['payments', 'verifyTransfer'],
    mutationFn: (vars: VerifyTransferVars) =>
      paymentService.verifyTransfer(vars.transactionId, vars.file as any, {
        transferCode: vars.transferCode,
        transferDate: vars.transferDate,
      }),

    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.payments.all }),
        qc.invalidateQueries({ queryKey: qk.appointments.all }),
      ])
    },
  })
}

// ============================================================
// PETS - create new pet (durante booking flow)
// ============================================================

export function useCreatePetMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['pets', 'create'],
    mutationFn: (data: CreatePetData) => petService.createPet(data),

    onSuccess: (newPet: Pet) => {
      // Optimistic prepend a la lista cacheada
      qc.setQueryData<Pet[] | undefined>(qk.pets.list(), (prev) =>
        prev ? [newPet, ...prev] : [newPet],
      )
      qc.setQueryData(qk.pets.detail(newPet.id), newPet)
    },
  })
}

// ============================================================
// PRICES (gestión de servicios y precios del vet)
// ============================================================

interface CreatePriceVars {
  serviceName: string
  priceCop: number
  priceCtg: number
}

export function useCreatePriceMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['prices', 'create'],
    mutationFn: (data: CreatePriceVars) => vetService.createPrice(data),

    onSuccess: (newPrice: any) => {
      qc.setQueryData<any[] | undefined>(qk.vets.me.prices(), (prev) =>
        prev ? [newPrice, ...prev] : [newPrice],
      )
    },
  })
}

interface UpdatePriceVars {
  priceId: string
  data: Partial<{
    serviceName: string
    priceCop: number
    priceCtg: number
    isActive: boolean
  }>
}

export function useUpdatePriceMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['prices', 'update'],
    mutationFn: ({ priceId, data }: UpdatePriceVars) =>
      vetService.updatePrice(priceId, data),

    onMutate: async ({ priceId, data }) => {
      await qc.cancelQueries({ queryKey: qk.vets.me.prices() })
      const previous = qc.getQueryData<any[]>(qk.vets.me.prices())

      // Optimistic update
      qc.setQueryData<any[] | undefined>(qk.vets.me.prices(), (prev) =>
        prev?.map((p) =>
          p.id === priceId ? { ...p, ...data, _optimistic: true } : p,
        ),
      )

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.vets.me.prices(), context.previous)
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.vets.me.prices() })
    },
  })
}

export function useDeletePriceMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['prices', 'delete'],
    mutationFn: (priceId: string) => vetService.deletePrice(priceId),

    onMutate: async (priceId) => {
      await qc.cancelQueries({ queryKey: qk.vets.me.prices() })
      const previous = qc.getQueryData<any[]>(qk.vets.me.prices())

      // Optimistic remove
      qc.setQueryData<any[] | undefined>(qk.vets.me.prices(), (prev) =>
        prev?.filter((p) => p.id !== priceId),
      )

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.vets.me.prices(), context.previous)
      }
    },
  })
}

// ============================================================
// VERIFICATION (vet sube documentos)
// ============================================================

interface UploadVerificationVars {
  /** FormData con los archivos: licenseDocument, diploma, idDocument, etc. */
  formData: FormData
}

export function useUploadVerificationMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['vets', 'verification', 'upload'],
    mutationFn: ({ formData }: UploadVerificationVars) =>
      vetService.uploadVerificationDocuments(formData),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.vets.me.verification() })
    },
  })
}

// ============================================================
// WITHDRAWAL (vet solicita retiro)
// ============================================================

interface WithdrawalVars {
  amountCop: number
  paymentMethod: 'BANK_TRANSFER' | 'NEQUI' | 'DAVIPLATA'
  accountInfo: {
    bankName?: string
    accountNumber?: string
    accountType?: 'SAVINGS' | 'CHECKING'
    phoneNumber?: string
  }
}

export function useRequestWithdrawalMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['payments', 'withdrawal'],
    mutationFn: (vars: WithdrawalVars) => paymentService.requestWithdrawal(vars),

    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.payments.balance() }),
        qc.invalidateQueries({ queryKey: qk.payments.all }),
        qc.invalidateQueries({ queryKey: qk.payments.earnings() }),
      ])
    },
  })
}

// ============================================================
// PROFILE (actualizar datos del usuario)
// ============================================================

interface UpdateProfileVars {
  firstName?: string
  lastName?: string
  phone?: string
  avatar?: string
}

export function useUpdateProfileMutation() {
  const qc = useQueryClient()

  return useMutation({
    mutationKey: ['auth', 'updateProfile'],
    mutationFn: (vars: UpdateProfileVars) => authService.updateProfile(vars),

    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: qk.auth.me() })
      const previous = qc.getQueryData(qk.auth.me())

      // Optimistic update local
      qc.setQueryData(qk.auth.me(), (prev: any) =>
        prev ? { ...prev, ...vars, _optimistic: true } : prev,
      )

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(qk.auth.me(), context.previous)
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.auth.me() })
    },
  })
}

// ============================================================
// PSE (initiate payment for top-up)
// ============================================================

interface InitiatePseVars {
  appointmentId: string
  amountCop: number
  bank: string
  userType: 'NATURAL' | 'JURIDICA'
}

export function useInitiatePseMutation() {
  return useMutation({
    mutationKey: ['payments', 'pse', 'initiate'],
    mutationFn: (vars: InitiatePseVars) =>
      paymentService.initiatePsePayment(vars),
  })
}
