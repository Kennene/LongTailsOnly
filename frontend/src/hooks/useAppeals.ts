import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type AppealsResponse, fetchAppeals } from '@/api/appeals';

export function useAppeals(): UseQueryResult<AppealsResponse> {
  return useQuery({ queryKey: ['appeals'], queryFn: fetchAppeals });
}
