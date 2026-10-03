import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { countDashboard } from '@/api/fixtures/dashboard';

import { getLeases, getSimulatedNow } from '../state';

/**
 * Handlery domeny „dashboard” (liczniki KPI z 4.6). Zadanie 5.6.
 *
 * Liczniki liczymy z tego samego stanu dzierżaw, który obsługuje `GET /api/v1/leases` — inaczej
 * pulpit mówi „Aktywne 12”, a tabela pokazuje piętnaście wierszy (defekt z audytu). Dzięki temu
 * liczniki reagują też na podróż w czasie: `getLeases()` dokłada statusy policzone dla bieżącego
 * zegara symulowanego, a `generated_at` to ten sam czas.
 */
export const dashboardHandlers: HttpHandler[] = [
  http.get('/api/v1/dashboard', () =>
    HttpResponse.json(countDashboard(getLeases(), getSimulatedNow())),
  ),
];
