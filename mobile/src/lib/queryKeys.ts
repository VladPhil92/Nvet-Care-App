/**
 * Query keys mobile — factory jerárquico para React Query.
 * Los filtros aceptan objetos tipados sin requerir index signatures.
 */

import type { QueryClient } from '@tanstack/react-query'

export const qk = {
  auth: {
    all: ['auth'] as const,
    me: () => [...qk.auth.all, 'me'] as const,
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
    transactions: (filters: object) =>
      [...qk.payments.all, 'transactions', filters] as const,
    earnings: (filters?: object) =>
      [...qk.payments.all, 'earnings', filters ?? {}] as const,
    ctgRate: () => [...qk.payments.all, 'ctg-rate'] as const,
  },

  chat: {
    all: ['chat'] as const,
    active: () => [...qk.chat.all, 'active'] as const,
    messages: (appointmentId: string) =>
      [...qk.chat.all, 'messages', appointmentId] as const,
    metadata: (appointmentId: string) =>
      [...qk.chat.all, 'metadata', appointmentId] as const,
  },

  pets: {
    all: ['pets'] as const,
    list: () => [...qk.pets.all, 'list'] as const,
    detail: (id: string) => [...qk.pets.all, 'detail', id] as const,
  },

  reviews: {
    all: ['reviews'] as const,
    forVet: (vetId: string, filters?: object) =>
      [...qk.reviews.all, 'vet', vetId, filters ?? {}] as const,
    mine: (filters?: object) =>
      [...qk.reviews.all, 'mine', filters ?? {}] as const,
    forAppointment: (appointmentId: string) =>
      [...qk.reviews.all, 'appointment', appointmentId] as const,
  },

  schedule: {
    all: ['schedule'] as const,
    forVet: (vetId: string, date: string) =>
      [...qk.schedule.all, vetId, date] as const,
  },

  prices: {
    all: ['prices'] as const,
    forVet: (vetId: string) => [...qk.prices.all, vetId] as const,
  },
} as const

export async function invalidateAfterBooking(
  qc: QueryClient,
  appointmentId?: string,
) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: qk.appointments.all }),
    qc.invalidateQueries({ queryKey: qk.payments.balance() }),
    appointmentId
      ? qc.invalidateQueries({ queryKey: qk.appointments.detail(appointmentId) })
      : Promise.resolve(),
  ])
}
