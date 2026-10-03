import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { buildGraphFixture } from '@/api/fixtures/graph';

import { getLeases } from '../state';

/**
 * Handlery domeny „graph” (węzły i krawędzie w formacie React Flow). Zadanie 5.9.
 *
 * Graf budujemy z **żywego** stanu dzierżaw tym samym builderem co fixture, więc podróż w czasie
 * i decyzje administratora przenoszą statusy na krawędzie (i zapalają `animated`) zamiast
 * zostawiać graf zamrożony na dniu startowym. Widok jest tylko do odczytu — decyzje przechodzą
 * przez `/api/v1/leases/...`.
 */
export const graphHandlers: HttpHandler[] = [
  http.get('/api/v1/graph', () => HttpResponse.json(buildGraphFixture(getLeases()))),
];
