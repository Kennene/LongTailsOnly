import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { countDashboard } from '@/api/fixtures/dashboard';

import { getLeases, getSimulatedNow } from '../state';
import { pendingAppealsCount } from './appeals';

/**
 * Handlery domeny „dashboard” — mirror realnego backendu (`app/api/v1/dashboard.py`):
 *
 * - `GET /api/v1/dashboard/stats` zwraca kontraktowy `DashboardStats` policzony jedną regułą
 *   (`app/domain/insights.py::compute_dashboard_counters`) z tego samego stanu dzierżaw, który
 *   obsługuje `GET /api/v1/leases` — inaczej pulpit mówi „Aktywne 12”, a tabela pokazuje
 *   piętnaście wierszy (defekt z audytu),
 * - `pending_appeals` to **żywy** licznik z domeny odwołań (backend liczy go z tabeli `Appeal`),
 *   więc rozstrzygnięcie wniosku widać na pulpicie po unieważnieniu `['dashboard']`,
 * - `generated_at` bierze się z zegara symulowanego, więc liczniki płyną z podróżą w czasie.
 */
export const dashboardHandlers: HttpHandler[] = [
  http.get('/api/v1/dashboard/stats', () =>
    HttpResponse.json(countDashboard(getLeases(), getSimulatedNow(), pendingAppealsCount())),
  ),
];
