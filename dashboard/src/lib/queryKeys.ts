/**
 * Query keys jerárquicos siguiendo el patrón factory.
 *
 * Beneficios:
 *  - Type-safe: TypeScript sabe la forma exacta de cada key
 *  - Invalidación predecible: invalidar `qk.admin.all` invalida toda la rama admin
 *  - Sin duplicación: la key se define una sola vez aquí
 *  - Fácil refactor: cambiar la estructura en un solo lugar
 *
 * Convenciones:
 *  - `all`: lista raíz para invalidación masiva
 *  - `lists()`: filtros por defecto
 *  - `list(filters)`: lista con filtros específicos
 *  - `details()`: detalles raíz
 *  - `detail(id)`: detalle de un recurso específico
 */

export const qk = {
  // ============================================================
  // AUTH / CURRENT USER
  // ============================================================
  auth: {
    all: ['auth'] as const,
    me: () => [...qk.auth.all, 'me'] as const,
  },

  // ============================================================
  // ADMIN
  // ============================================================
  admin: {
    all: ['admin'] as const,

    metrics: (filters?: { startDate?: string; endDate?: string }) =>
      [...qk.admin.all, 'metrics', filters ?? {}] as const,

    paymentStats: (filters?: { startDate?: string; endDate?: string }) =>
      [...qk.admin.all, 'payment-stats', filters ?? {}] as const,

    transactions: {
      all: () => [...qk.admin.all, 'transactions'] as const,
      list: (filters: Record<string, unknown>) =>
        [...qk.admin.transactions.all(), 'list', filters] as const,
      detail: (id: string) =>
        [...qk.admin.transactions.all(), 'detail', id] as const,
    },

    transferTracking: () => [...qk.admin.all, 'transfer-tracking'] as const,

    appointments: {
      all: () => [...qk.admin.all, 'appointments'] as const,
      list: (filters: Record<string, unknown>) =>
        [...qk.admin.appointments.all(), 'list', filters] as const,
    },

    veterinarians: {
      all: () => [...qk.admin.all, 'veterinarians'] as const,
      list: (filters: Record<string, unknown>) =>
        [...qk.admin.veterinarians.all(), 'list', filters] as const,
      detail: (id: string) =>
        [...qk.admin.veterinarians.all(), 'detail', id] as const,
    },
  },

  // ============================================================
  // VETS (público + propio)
  // ============================================================
  vets: {
    all: ['vets'] as const,

    search: (filters: Record<string, unknown>) =>
      [...qk.vets.all, 'search', filters] as const,

    detail: (id: string) => [...qk.vets.all, 'detail', id] as const,

    me: {
      all: () => [...qk.vets.all, 'me'] as const,
      profile: () => [...qk.vets.me.all(), 'profile'] as const,
      verification: () => [...qk.vets.me.all(), 'verification'] as const,
      earnings: (filters?: Record<string, unknown>) =>
        [...qk.vets.me.all(), 'earnings', filters ?? {}] as const,
      prices: () => [...qk.vets.me.all(), 'prices'] as const,
    },
  },

  // ============================================================
  // APPOINTMENTS (cliente / vet)
  // ============================================================
  appointments: {
    all: ['appointments'] as const,
    list: (filters: Record<string, unknown>) =>
      [...qk.appointments.all, 'list', filters] as const,
    detail: (id: string) => [...qk.appointments.all, 'detail', id] as const,
    today: () => [...qk.appointments.all, 'today'] as const,
    tracking: (id: string) =>
      [...qk.appointments.all, 'tracking', id] as const,
  },

  // ============================================================
  // PAYMENTS / BALANCE
  // ============================================================
  payments: {
    all: ['payments'] as const,
    balance: () => [...qk.payments.all, 'balance'] as const,
    transactions: (filters: Record<string, unknown>) =>
      [...qk.payments.all, 'transactions', filters] as const,
    transactionDetail: (id: string) =>
      [...qk.payments.all, 'transaction', id] as const,
    earnings: (filters?: Record<string, unknown>) =>
      [...qk.payments.all, 'earnings', filters ?? {}] as const,
    ctgRate: () => [...qk.payments.all, 'ctg-rate'] as const,
  },

  // ============================================================
  // CHAT
  // ============================================================
  chat: {
    all: ['chat'] as const,
    active: () => [...qk.chat.all, 'active'] as const,
    messages: (appointmentId: string) =>
      [...qk.chat.all, 'messages', appointmentId] as const,
    metadata: (appointmentId: string) =>
      [...qk.chat.all, 'metadata', appointmentId] as const,
  },
} as const

/**
 * Helper para invalidar múltiples ramas de cache de una sola vez.
 *
 * Uso típico tras una mutation:
 *   await invalidateAfterPayment(queryClient, txId)
 */
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
