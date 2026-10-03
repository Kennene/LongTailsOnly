import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchGraph } from '@/api/graph';
import type { PermissionGraph } from '@/types/api';

/**
 * Graf uprawnień (`fetchGraph`, krok 4.6B podmieni go na `GET /api/v1/graph`).
 *
 * Kształt to kontraktowy `PermissionGraph` (ADR 0009) — własny interfejs zniknął razem z
 * lokalnymi `GraphNode`/`GraphEdge`/`GraphResponse`.
 *
 * Do czasu 4.6B graf powstaje z listy dostępów, więc nie ma w nim węzłów zespołów (szczegóły
 * i uzasadnienie: `api/graph.ts`). Klucz `['graph']` jest unieważniany po każdej decyzji
 * o dostępie (spec §7.3), żeby widok pokazywał świeże statusy krawędzi po podróży w czasie
 * i po decyzjach administratora.
 */
export function useGraph(): UseQueryResult<PermissionGraph> {
  return useQuery({ queryKey: ['graph'], queryFn: fetchGraph });
}
