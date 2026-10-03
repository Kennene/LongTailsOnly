import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchTeamBaseline } from '@/api/baseline';
import { useActiveService } from '@/services/ServicesContext';
import type { BaselineEntry } from '@/types/api';

/**
 * Standard jednego zespołu (`GET /api/v1/teams/{slug}/baseline`) — sekcje DEV i QA na `/baseline`.
 *
 * `enabled: !isPending` — patrz `useLeases`: bramka trzyma odczyt poza namespace „brak usługi”.
 */
export function useTeamBaseline(team_slug: string): UseQueryResult<BaselineEntry[]> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['baseline', activeService.id, team_slug],
    queryFn: () => fetchTeamBaseline(team_slug),
    enabled: !isPending,
  });
}
