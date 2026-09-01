import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { vetService } from '../../services/vet.service'
import { STALE_TIMES } from '../../lib/queryClient'

export const vetQueryKeys = {
  root: ['vet'] as const,
  profile: () => ['vet', 'profile'] as const,
  earnings: () => ['vet', 'earnings'] as const,
  appointments: () => ['vet', 'appointments'] as const,
  today: () => ['vet', 'appointments', 'today'] as const,
  prices: () => ['vet', 'prices'] as const,
  verification: () => ['vet', 'verification'] as const,
  chats: () => ['vet', 'chats'] as const,
  scheduleExceptions: (startDate: string, endDate: string) =>
    ['vet', 'schedule-exceptions', startDate, endDate] as const,
}

export function useVetProfileQuery(enabled = true) {
  return useQuery({ queryKey: vetQueryKeys.profile(), queryFn: () => vetService.getProfile(), staleTime: STALE_TIMES.MEDIUM, enabled })
}

export function useVetEarningsQuery(enabled = true) {
  return useQuery({ queryKey: vetQueryKeys.earnings(), queryFn: () => vetService.getEarnings(), staleTime: STALE_TIMES.SHORT, enabled })
}

export function useVetAppointmentsQuery(enabled = true) {
  return useQuery({
    queryKey: vetQueryKeys.appointments(),
    queryFn: () => vetService.getAppointments(),
    staleTime: STALE_TIMES.SHORT,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useVetTodayAppointmentsQuery(enabled = true) {
  return useQuery({ queryKey: vetQueryKeys.today(), queryFn: () => vetService.getTodayAppointments(), staleTime: STALE_TIMES.REAL_TIME, enabled })
}

export function useVetPricesQuery(enabled = true) {
  return useQuery({ queryKey: vetQueryKeys.prices(), queryFn: () => vetService.getPrices(), staleTime: STALE_TIMES.MEDIUM, enabled })
}

export function useVetVerificationQuery(enabled = true) {
  return useQuery({ queryKey: vetQueryKeys.verification(), queryFn: () => vetService.getVerification(), staleTime: STALE_TIMES.MEDIUM, enabled })
}

export function useVetChatsQuery(enabled = true) {
  return useQuery({ queryKey: vetQueryKeys.chats(), queryFn: () => vetService.getActiveChats(), staleTime: STALE_TIMES.REAL_TIME, enabled })
}

export function useVetScheduleExceptionsQuery(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: vetQueryKeys.scheduleExceptions(startDate, endDate),
    queryFn: () => vetService.getScheduleExceptions(startDate, endDate),
    staleTime: STALE_TIMES.SHORT,
    enabled,
  })
}
