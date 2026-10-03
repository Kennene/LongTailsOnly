import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postAppeal } from '@/api/appeals';
import type { AppealCreate, AppealRead } from '@/types/api';

export function useSubmitAppeal(): UseMutationResult<AppealRead, Error, AppealCreate> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appeal: AppealCreate) => postAppeal(appeal.lease_id, appeal.justification),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appeals'] });
      void queryClient.invalidateQueries({ queryKey: ['leases'] });
      void queryClient.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
