import { useMutation, useQuery } from '@tanstack/react-query'
import aiService, { ClientAiMode, VetAiMode } from '../../services/ai.service'

export function useAiStatusQuery(enabled = true) {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => aiService.getStatus(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled,
  })
}

export function useClientAiAssistMutation() {
  return useMutation({
    mutationKey: ['ai', 'client-assist'],
    mutationFn: (input: {
      petId: string
      question: string
      mode: ClientAiMode
    }) => aiService.clientAssist(input),
  })
}

export function useVetAiAssistMutation() {
  return useMutation({
    mutationKey: ['ai', 'vet-assist'],
    mutationFn: (input: {
      appointmentId: string
      question: string
      mode: VetAiMode
    }) => aiService.vetAssist(input),
  })
}
