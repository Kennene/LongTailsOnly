import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchGraph } from '@/api/graph';
import { useActiveService } from '@/services/ServicesContext';
import type { PermissionGraph } from '@/types/api';

/**
 * Graf uprawnień — `GET /api/v1/graph` (`app/api/v1/graph.py`).
 *
 * Kształt to kontraktowy `PermissionGraph` (ADR 0009) razem z węzłami zespołów i krawędziami
 * członkostwa — frontend niczego nie dokłada.
 *
 * Do czasu 4.6B graf powstaje z listy dzierżaw, więc nie ma w nim węzłów zespołów (szczegóły
 * i uzasadnienie: `api/graph.ts`). Klucz `['graph', <id usługi>]` jest unieważniany po każdej
 * decyzji o dzierżawie (spec §7.3), żeby widok pokazywał świeże statusy krawędzi po podróży
 * w czasie i po decyzjach administratora.
 *
 * `enabled: !isPending` — patrz `useLeases`: dopóki katalog jest w drodze, `activeService.id` to
 * `''`, więc bez bramki graf startowałby w namespace „brak usługi”.
 */
export function useGraph(team: string | null = null): UseQueryResult<PermissionGraph> {
  const { activeService, isPending } = useActiveService();

  return useQuery({
    queryKey: ['graph', activeService.id, team],
    queryFn: () => fetchGraph(team === null ? {} : { team }),
    enabled: !isPending && activeService.id !== '',
  });
}
