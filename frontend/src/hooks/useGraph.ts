import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchGraph, type GraphResponse } from '@/api/graph';

/**
 * Graf uprawnień (`GET /api/v1/graph`, krok 4.6).
 *
 * Klucz `['graph']` jest unieważniany po każdej decyzji o dzierżawie (spec §7.3), żeby widok
 * pokazywał świeże statusy krawędzi po podróży w czasie i po decyzjach administratora.
 */
export function useGraph(): UseQueryResult<GraphResponse> {
  return useQuery({ queryKey: ['graph'], queryFn: fetchGraph });
}
