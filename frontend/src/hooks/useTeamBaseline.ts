import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchTeamBaseline } from '@/api/baseline';
import type { BaselineEntry } from '@/types/api';

/** Standard jednego zespołu (`GET /api/v1/teams/{slug}/baseline`) — sekcje DEV i QA na `/baseline`. */
export function useTeamBaseline(team_slug: string): UseQueryResult<BaselineEntry[]> {
  return useQuery({
    queryKey: ['baseline', team_slug],
    queryFn: () => fetchTeamBaseline(team_slug),
  });
}
