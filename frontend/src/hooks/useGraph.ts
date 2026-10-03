import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchGraph } from '@/api/graph';
import type { PermissionGraph } from '@/types/api';

/**
 * Graf uprawnień — `GET /api/v1/graph` (`app/api/v1/graph.py`).
 *
 * Kształt to kontraktowy `PermissionGraph` (ADR 0009) razem z węzłami zespołów i krawędziami
 * członkostwa — frontend niczego nie dokłada.
 *
 * `team` to **slug** zespołu (`dev`, `qa`) i wchodzi zarówno do zapytania (`?team=<slug>`), jak
 * i do klucza cache: pełny graf (`null`) i zawężony do zespołu to dwa osobne wpisy, więc powrót do
 * „Wszystkie” nie czeka na sieć. Prefiks `['graph']` unieważniamy po każdej decyzji o dzierżawie
 * (spec §7.3), żeby krawędzie niosły świeże statusy po podróży w czasie i po decyzjach.
 */
export function useGraph(team: string | null = null): UseQueryResult<PermissionGraph> {
  return useQuery({
    queryKey: ['graph', team],
    queryFn: () => fetchGraph(team === null ? {} : { team }),
  });
}
