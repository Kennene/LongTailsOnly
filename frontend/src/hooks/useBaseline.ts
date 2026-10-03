import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type BaselineResponse, fetchBaseline } from '@/api/baseline';

/** Standard jednego zespołu (`GET /api/v1/baseline/{team_slug}`) — sekcje DEV i QA widoku `/baseline`. */
export function useBaseline(team_slug: string): UseQueryResult<BaselineResponse> {
  return useQuery({
    queryKey: ['baseline', team_slug],
    queryFn: () => fetchBaseline(team_slug),
  });
}
