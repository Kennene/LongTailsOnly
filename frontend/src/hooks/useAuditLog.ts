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
 * `enabled: !isPending` — patrz `useLeases`: bez tej bramki dziennik startowałby w namespace
 * „brak usługi”, czyli z dodatkowym żądaniem i podmianą tabeli po dojściu katalogu.
 */
export function useAuditLog(): UseQueryResult<AuditEntry[]> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['audit', activeService.id],
    queryFn: fetchAuditLog,
    enabled: !isPending && activeService.id !== '',
  });
}
