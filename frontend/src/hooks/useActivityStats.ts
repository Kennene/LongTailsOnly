import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchActivityStats } from '@/api/activity';
import type { LeaseActivityStats } from '@/types/api';

/**
 * Statystyki użycia dzierżawy dla modala decyzji.
 *
 * `enabled` blokuje żądanie, dopóki nie ma konkretnej dzierżawy (`lease_id > 0`) — modal
 * montuje się także bez kontekstu odwołania.
 */
export function useActivityStats(lease_id: number): UseQueryResult<LeaseActivityStats> {
  return useQuery({
    queryKey: ['activity-stats', lease_id],
    queryFn: () => fetchActivityStats(lease_id),
    enabled: lease_id > 0,
  });
}
