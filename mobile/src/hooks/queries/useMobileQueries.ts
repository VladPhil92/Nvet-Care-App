import { useQuery, keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { qk } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'
import vetService from '../../services/vet.service'
import appointmentService from '../../services/appointment.service'
import paymentService from '../../services/payment.service'
import authService from '../../services/auth.service'
import petService from '../../services/pet.service'
import reviewService from '../../services/review.service'

/**
 * Queries de la app móvil organizadas por dominio.
 *
 * Convención: cada hook configura su `staleTime` semántico (REAL_TIME, SHORT, MEDIUM, LONG).
 * Las pantallas consumen los hooks directamente — no usan los stores Zustand para data
 * remota (Zustand queda solo para UI state como modo, filtros, drafts).
 */

// ============================================================
// AUTH
// ============================================================

export function useCurrentUserQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.auth.me(),
    queryFn: () => authService.getCurrentUser(),
    staleTime: STALE_TIMES.PERSISTENT,
    enabled: options?.enabled ?? true,
  })
}

// ============================================================
// VETS - búsqueda
// ============================================================

interface VetSearchFilters {
  latitude?: number
  longitude?: number
  radiusKm?: number
  specialty?: string
  tier?: string
  minRating?: number
  availableNow?: boolean
  city?: string
  search?: string
  limit?: number
  offset?: number
  sortBy?: string
}

export function useVetSearchQuery(filters: VetSearchFilters = {}) {
  return useQuery({
    queryKey: qk.vets.search(filters),
    queryFn: () => vetService.searchVets(filters),
    staleTime: STALE_TIMES.MEDIUM,
    placeholderData: keepPreviousData,
  })
}

/**
 * Versión paginada infinita para listas largas (UX scroll-to-load).
 */
export function useInfiniteVetSearchQuery(filters: Omit<VetSearchFilters, 'offset'> = {}) {
  const limit = filters.limit ?? 20

  return useInfiniteQuery({
    queryKey: qk.vets.search({ ...filters, _infinite: true }),
    queryFn: ({ pageParam = 0 }) =>
      vetService.searchVets({ ...filters, offset: pageParam, limit }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: any, _allPages, lastPageParam) => {
      if (!lastPage?.hasMore) return undefined
      return (lastPageParam as number) + limit
    },
    staleTime: STALE_TIMES.MEDIUM,
  })
}

// ============================================================
// VETS - detalle
// ============================================================

export function useVetDetailsQuery(id: string | undefined) {
  return useQuery({
    queryKey: qk.vets.detail(id ?? ''),
    queryFn: () => vetService.getVetDetails(id!),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: !!id,
  })
}

// ============================================================
// VET ME (perfil propio)
// ============================================================

export function useMyVetProfileQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.vets.me.profile(),
    queryFn: () => vetService.getMyProfile(),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: options?.enabled ?? true,
  })
}

export function useMyVerificationStatusQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.vets.me.verification(),
    queryFn: () => vetService.getVerificationStatus(),
    staleTime: STALE_TIMES.SHORT,
    enabled: options?.enabled ?? true,
  })
}

// ============================================================
// APPOINTMENTS
// ============================================================

interface AppointmentsFilters {
  status?: string
  startDate?: string
  endDate?: string
}

export function useAppointmentsQuery(filters: AppointmentsFilters = {}) {
  return useQuery({
    queryKey: qk.appointments.list(filters),
    queryFn: () => appointmentService.getAppointments(filters),
    staleTime: STALE_TIMES.SHORT,
    placeholderData: keepPreviousData,
  })
}

export function useAppointmentDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: qk.appointments.detail(id ?? ''),
    queryFn: () => appointmentService.getAppointmentById(id!),
    staleTime: STALE_TIMES.SHORT,
    enabled: !!id,
  })
}

export function useTodayAppointmentsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.appointments.today(),
    queryFn: () => appointmentService.getTodayAppointments(),
    staleTime: STALE_TIMES.REAL_TIME,
    enabled: options?.enabled ?? true,
  })
}

/**
 * Tracking en tiempo real de una cita.
 * `refetchInterval` solo activo en pantalla de tracking → la pantalla pasa el flag.
 */
export function useAppointmentTrackingQuery(
  id: string | undefined,
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: qk.appointments.tracking(id ?? ''),
    queryFn: () => appointmentService.getAppointmentTracking(id!),
    staleTime: STALE_TIMES.REAL_TIME,
    refetchInterval: options?.refetchInterval ?? 15_000, // 15s
    enabled: !!id,
  })
}

// ============================================================
// PAYMENTS / WALLET
// ============================================================

export function useBalanceQuery() {
  return useQuery({
    queryKey: qk.payments.balance(),
    queryFn: () => paymentService.getBalance(),
    staleTime: STALE_TIMES.REAL_TIME,
  })
}

export function useTransactionsQuery(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: qk.payments.transactions(filters),
    queryFn: () => paymentService.getTransactions(filters),
    staleTime: STALE_TIMES.SHORT,
    placeholderData: keepPreviousData,
  })
}

/**
 * Versión paginada infinita para WalletScreen / EarningsScreen.
 * Asume que el backend acepta `offset` y devuelve `{ items, hasMore }` o
 * un array (en cuyo caso `hasMore` se infiere por longitud == limit).
 */
export function useInfiniteTransactionsQuery(
  filters: Record<string, unknown> = {},
) {
  const limit = (filters.limit as number) ?? 20

  return useInfiniteQuery({
    queryKey: qk.payments.transactions({ ...filters, _infinite: true }),
    queryFn: ({ pageParam = 0 }) =>
      paymentService.getTransactions({
        ...(filters as any),
        offset: pageParam,
        limit,
      } as any),
    initialPageParam: 0,
    getNextPageParam: (lastPage: any, _allPages, lastPageParam) => {
      // Soporta ambos shapes del backend
      if (Array.isArray(lastPage)) {
        return lastPage.length === limit
          ? (lastPageParam as number) + limit
          : undefined
      }
      if (lastPage?.hasMore) {
        return (lastPageParam as number) + limit
      }
      return undefined
    },
    staleTime: STALE_TIMES.SHORT,
  })
}

export function useEarningsQuery(filters?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: qk.payments.earnings(filters),
    queryFn: () => paymentService.getEarningsSummary(filters),
    staleTime: STALE_TIMES.SHORT,
  })
}

export function useCtgRateQuery() {
  return useQuery({
    queryKey: qk.payments.ctgRate(),
    queryFn: () => paymentService.getCtgRate(),
    staleTime: STALE_TIMES.MEDIUM,
  })
}

// ============================================================
// PETS (mascotas del cliente)
// ============================================================

export function useMyPetsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.pets.list(),
    queryFn: () => petService.getMyPets(),
    staleTime: STALE_TIMES.LONG,
    enabled: options?.enabled ?? true,
  })
}

export function usePetDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: qk.pets.detail(id ?? ''),
    queryFn: () => petService.getPetById(id!),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: !!id,
  })
}

// ============================================================
// VET SCHEDULE (slots disponibles para una fecha)
// ============================================================

/**
 * Slots disponibles del vet para la fecha indicada.
 * `staleTime` corto porque la disponibilidad cambia con cada booking.
 */
export function useVetScheduleQuery(
  vetId: string | undefined,
  date: string | undefined,
) {
  return useQuery({
    queryKey: qk.schedule.forVet(vetId ?? '', date ?? ''),
    queryFn: () => vetService.getVetSchedule(vetId!, date!),
    staleTime: STALE_TIMES.SHORT,
    enabled: !!vetId && !!date,
  })
}

// ============================================================
// VET PRICES (lista de servicios y precios de un vet)
// ============================================================

export function useVetPricesQuery(vetId: string | undefined) {
  return useQuery({
    queryKey: qk.prices.forVet(vetId ?? ''),
    queryFn: () => vetService.getVetPrices(vetId!),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: !!vetId,
  })
}

/**
 * Lista de precios del vet autenticado (incluye los inactivos para el editor).
 */
export function useMyPricesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.vets.me.prices(),
    queryFn: () => vetService.getMyPrices(),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: options?.enabled ?? true,
  })
}

// ============================================================
// REVIEWS
// ============================================================

/**
 * Reviews de un vet (público, usado en VetDetailsScreen).
 */
export function useVetReviewsQuery(
  vetId: string | undefined,
  filters: { limit?: number; offset?: number; minRating?: number } = {},
) {
  return useQuery({
    queryKey: qk.reviews.forVet(vetId ?? '', filters as any),
    queryFn: () => reviewService.getVetReviews(vetId!, filters),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: !!vetId,
    placeholderData: keepPreviousData,
  })
}

/**
 * Review de una cita específica del cliente autenticado.
 * Retorna null si aún no ha calificado esa cita.
 */
export function useAppointmentReviewQuery(appointmentId: string | undefined) {
  return useQuery({
    queryKey: qk.reviews.forAppointment(appointmentId ?? ''),
    queryFn: () => reviewService.getAppointmentReview(appointmentId!),
    staleTime: STALE_TIMES.LONG,
    enabled: !!appointmentId,
  })
}

/**
 * Reviews propias del cliente autenticado.
 */
export function useMyReviewsQuery(
  filters: { limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: qk.reviews.mine(filters as any),
    queryFn: () => reviewService.getMyReviews(filters),
    staleTime: STALE_TIMES.MEDIUM,
    placeholderData: keepPreviousData,
  })
}
