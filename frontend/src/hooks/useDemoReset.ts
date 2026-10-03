import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postDemoReset } from '@/api/simulation';
import type { DemoResetResult } from '@/types/api';

/** Reset scenariusza demo (kasuje bazę i zeruje zegar) — używany przez pasek czasu. */
export function useDemoReset(): UseMutationResult<DemoResetResult, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postDemoReset(),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
