import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { dashboardFixture } from './fixtures/dashboard';

/**
 * Liczniki KPI pulpitu — odpowiedź `GET /api/v1/dashboard` (krok backendu 4.6).
 *
 * Typ lokalny, bo 4.6 nie istnieje jeszcze w kontrakcie, a `src/types/api.ts` jest generowany
 * z Pydantic (ADR 0009) i nie edytujemy go ręcznie. Gdy backend dostarczy schemat, przenosimy
 * ten interfejs do `backend/app/schemas/`, regenerujemy kontrakt i importujemy stąd typ
 * z `@/types/api` — wtedy ta definicja znika.
 */
export interface DashboardCounters {
  active: number;
  warning: number;
  expired: number;
  downscope_recommendations: number;
}

export async function fetchDashboard(): Promise<DashboardCounters> {
  if (shouldUseFixtures()) {
    return dashboardFixture;
  }

  return getJson<DashboardCounters>('/api/v1/dashboard');
}
