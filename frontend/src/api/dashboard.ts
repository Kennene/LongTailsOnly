import type { DashboardStats } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { dashboardFixture } from './fixtures/dashboard';

/**
 * Liczniki KPI pulpitu — `GET /api/v1/dashboard/stats` (`app/api/v1/dashboard.py`).
 *
 * Backend liczy całą dziewiątkę pól jedną regułą (`app/domain/insights.py::compute_dashboard_counters`)
 * i oddaje kontraktowy `DashboardStats`, więc frontend **nie liczy już niczego**: żadnego odczytu
 * listy dostępów, zegara ani odwołań, żadnego nadpisywania `pending_appeals`. Odpowiedź idzie na
 * ekran co do znaku, a brak endpointu (404) jest błędem widoku — dwie ścieżki danych to dwa różne
 * pulpitery, więc cichy fallback na liczenie z listy dostępów byłby kłamstwem o stanie systemu.
 *
 * Tryb `VITE_USE_FIXTURES=true` (praca bez backendu) zostaje na wspólnym fixture: te same kształty,
 * ta sama reguła co backend, bez pytania API.
 */
export async function fetchDashboard(): Promise<DashboardStats> {
  if (shouldUseFixtures()) {
    return dashboardFixture;
  }

  return getJson<DashboardStats>('/api/v1/dashboard/stats');
}
