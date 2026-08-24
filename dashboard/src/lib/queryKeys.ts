/**
 * Query keys jerárquicos siguiendo el patrón factory.
 * Los filtros se aceptan como objetos tipados sin exigir index signatures;
 * React Query serializa objetos estructurales de forma determinista.
 */
export const qk = {
  auth: {
    all: ['auth'] as const,
    me: () => [...qk.auth.all, 'me'] as const,
  },

  admin: {
    all: ['admin'] as const,
    metrics: (filters?: object) =>
      [...qk.admin.all, 'metrics', filters ?? {}] as const,
    paymentStats: (filters?: object) =>
      [...qk.admin.all, 'payment-stats', filters ?? {}] as const,
    transactions: {
      all: () => [...qk.admin.all, 'transactions'] as const,
      list: (filters: object) =>
        [...qk.admin.transactions.all(), 'list', filters] as const,
      detail: (id: string) =>
        [...qk.admin.transactions.all(), 'detail', id] as const,
    },
    transferTracking: () => [...qk.admin.all, 'transfer-tracking'] as const,
    appointments: {
      all: () => [...qk.admin.all, 'appointments'] as const,
      list: (filters: object) =>
        [...qk.admin.appointments.all(), 'list', filters] as const,
    },
    veterinarians: {
      all: () => [...qk.admin.all, 'veterinarians'] as const,
      list: (filters: object) =>
        [...qk.admin.veterinarians.all(), 'list', filters] as const,
      detail: (id: string) =>
        [...qk.admin.veterinarians.all(), 'detail', id] as const,
    },
  },

  vets: {
    all: ['vets'] as const,
    search: (filters: object) => [...qk.vets.all, 'search', filters] as const,
    detail: (id: string) => [...qk.vets.all, 'detail', id] as const,
    me: {
      all: () => [...qk.vets.all, 'me'] as const,
      profile: () => [...qk.vets.me.all(), 'profile'] as const,
      verification: () => [...qk.vets.me.all(), 'verification'] as const,
      earnings: (filters?: object) =>
        [...qk.vets.me.all(), 'earnings', filters ?? {}] as const,
      prices: () => [...qk.vets.me.all(), 'prices'] as const,
    },
  },

  appointments: {
    all: ['appointments'] as const,
    list: (filters: object) => [...qk.appointments.all, 'list', filters] as const,
    detail: (id: string) => [...qk.appointments.all, 'detail', id] as const,
    today: () => [...qk.appointments.all, 'today'] as const,
    tracking: (id: string) => [...qk.appointments.all, 'tracking', id] as const,
  },

  payments: {
    all: ['payments'] as const,
    balance: () => [...qk.payments.all, 'balance'] as const,
    transactions: (filters: object) => [...qk.payments.all, 'transactions', filters] as const,
    transactionDetail: (id: string) => [...qk.payments.all, 'transaction', id] as const,
    earnings: (filters?: object) => [...qk.payments.all, 'earnings', filters ?? {}] as const,
    ctgRate: () => [...qk.payments.all, 'ctg-rate'] as const,
  },

  chat: {
    all: ['chat'] as const,
    active: () => [...qk.chat.all, 'active'] as const,
    messages: (appointmentId: string) => [...qk.chat.all, 'messages', appointmentId] as const,
    metadata: (appointmentId: string) => [...qk.chat.all, 'metadata', appointmentId] as const,
  },
} as const

import type { QueryClient } from '@tanstack/react-query'

export async function invalidateAfterPayment(
  qc: QueryClient,
  appointmentId?: string,
) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.payments.all }),
    qc.invalidateQueries({ queryKey: qk.appointments.all }),
    qc.invalidateQueries({ queryKey: qk.admin.transactions.all() }),
    qc.invalidateQueries({ queryKey: qk.admin.transferTracking() }),
    qc.invalidateQueries({ queryKey: qk.admin.metrics() }),
    appointmentId
      ? qc.invalidateQueries({ queryKey: qk.appointments.detail(appointmentId) })
      : Promise.resolve(),
  ])
}

export async function invalidateAfterVetUpdate(
  qc: QueryClient,
  vetId?: string,
) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.vets.all }),
    qc.invalidateQueries({ queryKey: qk.admin.veterinarians.all() }),
    vetId
      ? qc.invalidateQueries({ queryKey: qk.vets.detail(vetId) })
      : Promise.resolve(),
  ])
}
