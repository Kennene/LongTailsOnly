import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { graphFixture } from '@/api/fixtures/graph';

/**
 * Handlery domeny „graph” (węzły i krawędzie w formacie React Flow). Zadanie 5.9.
 *
 * Odczyt zwraca fixture w kształcie oczekiwanego kontraktu 4.6 — graf jest widokiem
 * tylko do odczytu, decyzje o dzierżawach przechodzą przez `/api/v1/leases/...`.
 */
export const graphHandlers: HttpHandler[] = [
  http.get('/api/v1/graph', () => HttpResponse.json(graphFixture)),
];
