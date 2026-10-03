import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postLeaseDecision } from '@/api/leases';
import { useActiveService } from '@/services/ServicesContext';
import type { DecisionRequest, LeaseOverview } from '@/types/api';

export interface LeaseDecisionVariables {
  lease_id: number;
  request: DecisionRequest;
}

/**
 * Decyzja o dzierżawie. Unieważnienia niosą prefiks **aktywnej usługi**, bo tylko ona ma te dane
 * w cache — goły prefiks unieważniałby wpisy wszystkich usług naraz.
 */
export function useLeaseDecision(): UseMutationResult<
  LeaseOverview,
  Error,
  LeaseDecisionVariables
> {
  const queryClient = useQueryClient();
  const { activeService } = useActiveService();

  return useMutation({
    mutationFn: ({ lease_id, request }: LeaseDecisionVariables) =>
      postLeaseDecision(lease_id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leases', activeService.id] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard', activeService.id] });
      void queryClient.invalidateQueries({ queryKey: ['audit', activeService.id] });
      void queryClient.invalidateQueries({ queryKey: ['appeals', activeService.id] });
      void queryClient.invalidateQueries({ queryKey: ['graph', activeService.id] });
    },
  });
}
