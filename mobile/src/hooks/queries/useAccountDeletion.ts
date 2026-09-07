import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import authService, {
  DeleteAccountPayload,
} from '../../services/auth.service'

export function useAccountDeletionReadinessQuery() {
  return useQuery({
    queryKey: ['auth', 'account-deletion-readiness'],
    queryFn: () => authService.getAccountDeletionReadiness(),
    staleTime: 15_000,
  })
}

export function useDeleteAccountMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['auth', 'delete-account'],
    mutationFn: (payload: DeleteAccountPayload) =>
      authService.deleteAccount(payload),
    onSuccess: () => queryClient.clear(),
  })
}
