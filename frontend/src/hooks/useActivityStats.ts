import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchActivityStats } from '@/api/activity';
import { useActiveService } from '@/services/ServicesContext';
import type { LeaseActivityStats } from '@/types/api';

/**
 * Statystyki użycia dzierżawy dla modala decyzji — w kontekście aktywnej usługi.
 *
 * `enabled` blokuje żądanie, dopóki nie ma konkretnej dzierżawy (`lease_id > 0`) — modal
 * montuje się także bez kontekstu odwołania — oraz dopóki nie ma identyfikatora usługi, której
 * można by przypisać dane (patrz `useLeases`).
 */
export function useActivityStats(lease_id: number): UseQueryResult<LeaseActivityStats> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['activity-stats', activeService.id, lease_id],
    queryFn: () => fetchActivityStats(lease_id),
    enabled: lease_id > 0 && !isPending && activeService.id !== '',
  });
}
