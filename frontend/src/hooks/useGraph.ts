import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchGraph } from '@/api/graph';
import type { PermissionGraph } from '@/types/api';

/**
 * Graf uprawnień (`GET /api/v1/graph`, krok 4.6).
 *
 * Kształt to kontraktowy `PermissionGraph` (ADR 0009) — własny interfejs zniknął razem z
 * lokalnymi `GraphNode`/`GraphEdge`/`GraphResponse`.
 *
 * Klucz `['graph']` jest unieważniany po każdej decyzji o dzierżawie (spec §7.3), żeby widok
 * pokazywał świeże statusy krawędzi po podróży w czasie i po decyzjach administratora.
 */
export function useGraph(): UseQueryResult<PermissionGraph> {
  return useQuery({ queryKey: ['graph'], queryFn: fetchGraph });
}
