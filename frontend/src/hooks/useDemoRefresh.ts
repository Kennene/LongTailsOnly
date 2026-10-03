import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postDemoRefresh } from '@/api/simulation';
import type { DemoRefreshResult } from '@/types/api';

/**
 * Odświeżenie demo (nowa osoba albo losowa aktywność) — używane przez przycisk w górnym pasku.
 * Zmienia skład zespołów, terminy dostępów i liczniki naraz, więc jak reset unieważnia wszystko.
 */
export function useDemoRefresh(): UseMutationResult<DemoRefreshResult, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postDemoRefresh(),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
