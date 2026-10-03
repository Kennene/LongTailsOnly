import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { dashboardFixture } from '@/api/fixtures/dashboard';

/**
 * Handlery domeny „dashboard” (liczniki KPI z 4.6). Zadanie 5.6.
 *
 * Liczniki zwracamy wprost z fixture'u — przeliczanie ich ze stanu dzierżaw należy do
 * stanowej symulacji backendu (zadanie 14), a frontend nigdy nie liczy statusów sam.
 */
export const dashboardHandlers: HttpHandler[] = [
  http.get('/api/v1/dashboard', () => HttpResponse.json(dashboardFixture)),
];
