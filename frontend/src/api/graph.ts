import type { LeaseStatus, Role } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { graphFixture } from './fixtures/graph';

/**
 * Graf uprawnień — odpowiedź `GET /api/v1/graph` (krok backendu 4.6).
 *
 * Typy poniżej to **oczekiwany kontrakt 4.6** w kształcie React Flow (`@xyflow/react` v12).
 * Trzymamy je tutaj, a nie w generowanym `src/types/api.ts` (ADR 0009 — plik powstaje
 * z Pydantic i nie edytujemy go ręcznie), bo 4.6 jeszcze nie istnieje w kontrakcie.
 * Gdy backend dostarczy schemat, przenosimy te interfejsy do `backend/app/schemas/`,
 * regenerujemy kontrakt i importujemy je z `@/types/api` — wtedy ta definicja znika.
 * Pola `position` może brakować: uzupełnia je deterministycznie `lib/graphLayout.ts`.
 */
export interface GraphNode {
  id: string;
  type: 'user' | 'team' | 'repo';
  position?: { x: number; y: number };
  data: { label: string; status?: LeaseStatus; team?: string };
}

/** Krawędź grafu: członkostwo w zespole albo dzierżawa dostępu do repozytorium. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data?: { role?: Role; status?: LeaseStatus };
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function fetchGraph(): Promise<GraphResponse> {
  if (shouldUseFixtures()) {
    return graphFixture;
  }

  return getJson<GraphResponse>('/api/v1/graph');
}
