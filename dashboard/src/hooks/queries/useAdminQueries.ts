import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { qk } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'
import adminService from '../../services/admin.service'

/**
 * Hooks de queries para el dominio Admin.
 *
 * Cada hook configura `staleTime` según la naturaleza del dato:
 *  - Métricas / transferencias en cola: 30 s (cambia con frecuencia)
 *  - Transacciones / citas: 60 s (cambios menos frecuentes)
 *  - Vets: 5 min (lista relativamente estable)
 *
 * Todos usan `keepPreviousData` para evitar el flash de loading state
 * al cambiar de página o filtros.
 */

// ============================================================
// METRICS
// ============================================================

interface MetricsFilters {
  startDate?: string
  endDate?: string
}

export function useMetricsQuery(filters: MetricsFilters = {}) {
  return useQuery({
    queryKey: qk.admin.metrics(filters),
    queryFn: () => adminService.getMetrics(filters),
    staleTime: STALE_TIMES.REAL_TIME,
    placeholderData: keepPreviousData,
  })
}

export function usePaymentMethodStatsQuery(filters: MetricsFilters = {}) {
  return useQuery({
    queryKey: qk.admin.paymentStats(filters),
    queryFn: () => adminService.getPaymentMethodStats(filters),
    staleTime: STALE_TIMES.SHORT,
    placeholderData: keepPreviousData,
  })
}

// ============================================================
// TRANSACTIONS
// ============================================================

interface TransactionFilters {
  status?: string
  paymentMethod?: string
  startDate?: string
  endDate?: string
  vetName?: string
  limit?: number
  offset?: number
}

export function useAdminTransactionsQuery(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: qk.admin.transactions.list(filters),
    queryFn: () => adminService.getTransactions(filters),
    staleTime: STALE_TIMES.SHORT,
    placeholderData: keepPreviousData,
  })
}

// ============================================================
// TRANSFER TRACKING (panel de pendientes)
// ============================================================

export function useTransferTrackingQuery(options?: {
  refetchInterval?: number
  enabled?: boolean
}) {
  return useQuery({
    queryKey: qk.admin.transferTracking(),
    queryFn: () => adminService.getTransferTracking(),
    // Datos de cola: stale rápido + opcional refetch automático
    staleTime: STALE_TIMES.REAL_TIME,
    refetchInterval: options?.refetchInterval ?? false,
    enabled: options?.enabled ?? true,
  })
}

// ============================================================
// APPOINTMENTS
// ============================================================

interface AdminAppointmentFilters {
  status?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export function useAdminAppointmentsQuery(filters: AdminAppointmentFilters = {}) {
  return useQuery({
    queryKey: qk.admin.appointments.list(filters),
    queryFn: () => adminService.getAppointments(filters),
    staleTime: STALE_TIMES.SHORT,
    placeholderData: keepPreviousData,
  })
}

// ============================================================
// VETERINARIANS
// ============================================================

interface VetsFilters {
  tier?: string
  verificationStatus?: string
  search?: string
  limit?: number
  offset?: number
}

export function useVeterinariansQuery(filters: VetsFilters = {}) {
  return useQuery({
    queryKey: qk.admin.veterinarians.list(filters),
    queryFn: () => adminService.getVeterinarians(filters),
    staleTime: STALE_TIMES.MEDIUM,
    placeholderData: keepPreviousData,
  })
}
