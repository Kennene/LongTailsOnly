import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type AuditLogResponse, fetchAuditLog } from '@/api/audit';

/**
 * Dziennik audytu (`GET /api/v1/audit`) — widok `/audit`.
 *
 * Klucz `['audit']` jest tym, który inwalidują decyzje o dzierżawach (spec §7.3), więc dziennik
 * odświeża się razem z listą dzierżaw i pulpitem.
 */
export function useAuditLog(): UseQueryResult<AuditLogResponse> {
  return useQuery({ queryKey: ['audit'], queryFn: fetchAuditLog });
}
