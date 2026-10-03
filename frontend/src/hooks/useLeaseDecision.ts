import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postLeaseDecision } from '@/api/leases';
import type { DecisionRequest, LeaseOverview } from '@/types/api';

export interface LeaseDecisionVariables {
  lease_id: number;
  request: DecisionRequest;
}

export function useLeaseDecision(): UseMutationResult<
  LeaseOverview,
  Error,
  LeaseDecisionVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ lease_id, request }: LeaseDecisionVariables) =>
      postLeaseDecision(lease_id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leases'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
      void queryClient.invalidateQueries({ queryKey: ['graph'] });
    },
  });
}
