import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchAuditLog } from '@/api/audit';
import { useActiveService } from '@/services/ServicesContext';
import type { AuditEntry } from '@/types/api';

/**
 * Dziennik audytu (`GET /api/v1/audit`) — widok `/audit` aktywnej usługi.
 *
 * Klucz `['audit', <id usługi>]` jest tym, który inwalidują decyzje o dzierżawach (spec §7.3),
 * więc dziennik odświeża się razem z listą dzierżaw i pulpitem.
 *
 * `enabled` — patrz `useLeases`: bramka nie pyta o dane, dopóki nie ma identyfikatora usługi,
 * której można by je przypisać.
 */
export function useAuditLog(): UseQueryResult<AuditEntry[]> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['audit', activeService.id],
    queryFn: fetchAuditLog,
    enabled: !isPending && activeService.id !== '',
  });
}
