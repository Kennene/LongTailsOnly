import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';

import { postTimeTravel } from '@/api/simulation';
import type { ClockRead, TimeTravelRequest } from '@/types/api';

export function useTimeTravel(): UseMutationResult<ClockRead, Error, TimeTravelRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: TimeTravelRequest) => postTimeTravel(request),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
