import type { PermissionGraph } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { graphFixture } from './fixtures/graph';

/**
 * Filtry grafu — te same, które przyjmuje `GET /api/v1/graph` (`app/api/v1/graph.py`).
 *
 * `team` to **slug** zespołu (`dev`, `qa`), nie jego nazwa z węzła (`DEV`, `QA`): backend rozwiązuje
 * go przez `baseline_service.team_by_slug` i odpowiada `404` na nieznany slug.
 */
export interface GraphQuery {
  team?: string;
}

/**
 * Graf uprawnień dla widoku `/graph` — `GET /api/v1/graph`.
 *
 * Backend oddaje gotowy `PermissionGraph` w formacie React Flow (ADR 0009): węzły zespołów, osób
 * i repozytoriów oraz krawędzie `membership` i `lease` z rolą, statusem i rekomendacją. Frontend
 * **nie składa już grafu z listy dzierżaw** — lista nie niesie składu zespołów, więc taka ścieżka
 * kłamałaby o członkostwie, a `position` węzłów i tak musi przyjść z API.
 *
 * Odpowiedź idzie na ekran co do znaku: brak endpointu (404) jest błędem widoku, a nie powodem do
 * cichego powrotu na ścieżkę pochodną. Układ kolumnowy (`lib/graphLayout.ts`) zostaje wyłącznie
 * jako zabezpieczenie widoku na odpowiedź bez `position` — patrz `GraphPage`.
 *
 * Tryb `VITE_USE_FIXTURES=true` (praca bez backendu) zostaje na wspólnym fixture: ten sam kształt
 * i ta sama reguła co backend, bez pytania API.
 */
export async function fetchGraph(query: GraphQuery = {}): Promise<PermissionGraph> {
  if (shouldUseFixtures()) {
    return graphFixture;
  }

  return getJson<PermissionGraph>(`/api/v1/graph${buildQueryString(query)}`);
}

function buildQueryString(query: GraphQuery): string {
  if (query.team === undefined) {
    return '';
  }

  return `?${new URLSearchParams({ team: query.team }).toString()}`;
}
