import { useQuery, keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { qk } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'
import vetService, { VetSearchFilters } from '../../services/vet.service'
import appointmentService, { AppointmentStatus } from '../../services/appointment.service'
import paymentService from '../../services/payment.service'
import authService from '../../services/auth.service'
import petService from '../../services/pet.service'
import reviewService from '../../services/review.service'

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
// VETS
// ============================================================

export function useVetSearchQuery(filters: VetSearchFilters = {}) {
  return useQuery({
    queryKey: qk.vets.search(filters),
    queryFn: () => vetService.searchVets(filters),
    staleTime: STALE_TIMES.MEDIUM,
    placeholderData: keepPreviousData,
  })
}

export function useInfiniteVetSearchQuery(
  filters: Omit<VetSearchFilters, 'offset'> = {},
) {
  const limit = filters.limit ?? 20

  return useInfiniteQuery({
    queryKey: qk.vets.search({ ...filters, _infinite: true }),
    queryFn: ({ pageParam = 0 }) =>
      vetService.searchVets({ ...filters, offset: pageParam, limit }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasMore) return undefined
      return (lastPageParam as number) + limit
    },
    staleTime: STALE_TIMES.MEDIUM,
  })
}

export function useVetDetailsQuery(id: string | undefined) {
  return useQuery({
    queryKey: qk.vets.detail(id ?? ''),
    queryFn: () => vetService.getVetDetails(id!),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: !!id,
  })
}

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
  status?: AppointmentStatus
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

export function useAppointmentTrackingQuery(
  id: string | undefined,
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: qk.appointments.tracking(id ?? ''),
    queryFn: () => appointmentService.getAppointmentTracking(id!),
    staleTime: STALE_TIMES.REAL_TIME,
    refetchInterval: options?.refetchInterval ?? 15_000,
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
// PETS
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
// SCHEDULE / PRICES
// ============================================================

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

export function useVetPricesQuery(vetId: string | undefined) {
  return useQuery({
    queryKey: qk.prices.forVet(vetId ?? ''),
    queryFn: () => vetService.getVetPrices(vetId!),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: !!vetId,
  })
}

export function useMyPricesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.vets.me.prices(),
    queryFn: () => vetService.getMyPrices(),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: options?.enabled ?? true,
  })
}

export function useScheduleExceptionsQuery(
  startDate: string,
  endDate: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['vets', 'me', 'schedule', 'exceptions', startDate, endDate],
    queryFn: () => vetService.getMyScheduleExceptions(startDate, endDate),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: (options?.enabled ?? true) && !!startDate && !!endDate,
  })
}

// ============================================================
// REVIEWS
// ============================================================

export function useVetReviewsQuery(
  vetId: string | undefined,
  filters: { limit?: number; offset?: number; minRating?: number } = {},
) {
  return useQuery({
    queryKey: qk.reviews.forVet(vetId ?? '', filters),
    queryFn: () => reviewService.getVetReviews(vetId!, filters),
    staleTime: STALE_TIMES.MEDIUM,
    enabled: !!vetId,
    placeholderData: keepPreviousData,
  })
}

export function useAppointmentReviewQuery(appointmentId: string | undefined) {
  return useQuery({
    queryKey: qk.reviews.forAppointment(appointmentId ?? ''),
    queryFn: () => reviewService.getAppointmentReview(appointmentId!),
    staleTime: STALE_TIMES.LONG,
    enabled: !!appointmentId,
  })
}

export function useMyReviewsQuery(
  filters: { limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: qk.reviews.mine(filters),
    queryFn: () => reviewService.getMyReviews(filters),
    staleTime: STALE_TIMES.MEDIUM,
    placeholderData: keepPreviousData,
  })
}
