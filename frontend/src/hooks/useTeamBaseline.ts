import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchTeamBaseline } from '@/api/baseline';
import { useActiveService } from '@/services/ServicesContext';
import type { BaselineEntry } from '@/types/api';

/**
 * Standard jednego zespołu (`GET /api/v1/teams/{slug}/baseline`) — sekcje DEV i QA na `/baseline`.
 *
 * `enabled` — patrz `useLeases`: bramka nie pyta o dane, dopóki nie ma identyfikatora usługi,
 * której można by je przypisać.
 */
export function useTeamBaseline(team_slug: string): UseQueryResult<BaselineEntry[]> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['baseline', activeService.id, team_slug],
    queryFn: () => fetchTeamBaseline(team_slug),
    enabled: !isPending && activeService.id !== '',
  });
}
