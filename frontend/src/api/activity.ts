import { getJson } from './client';
import { shouldUseFixtures } from './config';

/**
 * Statystyki użycia dzierżawy dla modala decyzji (UC-3) — odpowiedź
 * `GET /api/v1/leases/{lease_id}/activity-stats` (krok backendu 4.4).
 *
 * Typ lokalny, bo 4.4 nie istnieje jeszcze w kontrakcie, a `src/types/api.ts` jest generowany
 * z Pydantic (ADR 0009) i nie edytujemy go ręcznie. Gdy backend dostarczy schemat, przenosimy
 * ten interfejs do `backend/app/schemas/`, regenerujemy kontrakt i importujemy typ
 * z `@/types/api` — wtedy ta definicja znika.
 */
export interface LeaseActivityStats {
  push: number;
  review: number;
  comment: number;
}

/**
 * Fixture w kształcie oczekiwanej odpowiedzi 4.4 — literał z jawnym typem, więc literówka
 * w nazwie licznika jest błędem kompilacji, a nie pustym kafelkiem na demo.
 */
export const activityStatsFixture: LeaseActivityStats = {
  push: 5,
  review: 4,
  comment: 7,
};

export async function fetchActivityStats(lease_id: number): Promise<LeaseActivityStats> {
  if (shouldUseFixtures()) {
    return activityStatsFixture;
  }

  return getJson<LeaseActivityStats>(`/api/v1/leases/${lease_id}/activity-stats`);
}
