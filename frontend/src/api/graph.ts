import type { PermissionGraph } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { graphFixture } from './fixtures/graph';

/**
 * Graf uprawnień — odpowiedź `GET /api/v1/graph` (backend 4.6).
 *
 * Kształt bierzemy z generowanego kontraktu: `PermissionGraph { nodes, edges }`, gdzie
 * `GraphNode` ma **wymagane** `position`, a `GraphNodeData`/`GraphEdgeData` niosą etykietę,
 * zespół, rolę, status i rekomendację. Status wisi wyłącznie na krawędziach dzierżaw — węzły
 * nie mają go w kontrakcie, więc widok wylicza kolor węzła z jego krawędzi.
 */
export async function fetchGraph(): Promise<PermissionGraph> {
  if (shouldUseFixtures()) {
    return graphFixture;
  }

  return getJson<PermissionGraph>('/api/v1/graph');
}
