import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchAuditLog } from '@/api/audit';
import type { AuditEntry } from '@/types/api';

/**
 * Dziennik audytu (`GET /api/v1/audit`) — widok `/audit`.
 *
 * Klucz `['audit']` jest tym, który inwalidują decyzje o dostępach (spec §7.3), więc dziennik
 * odświeża się razem z listą dostępów i pulpitem.
 */
export function useAuditLog(): UseQueryResult<AuditEntry[]> {
  return useQuery({ queryKey: ['audit'], queryFn: fetchAuditLog });
}
