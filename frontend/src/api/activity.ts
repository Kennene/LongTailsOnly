import type { LeaseOverview } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { countActivityStats } from './fixtures/activity';
import { clockFixture } from './fixtures/clock';
import { leasesFixture } from './fixtures/leases';

/**
 * Statystyki użycia dzierżawy dla modala decyzji (UC-3) — odpowiedź
 * `GET /api/v1/leases/{lease_id}/activity-stats` (krok backendu 4.4).
 *
 * Typ lokalny, bo 4.4 nie istnieje jeszcze w kontrakcie, a `src/types/api.ts` jest generowany
 * z Pydantic (ADR 0009) i nie edytujemy go ręcznie. Gdy backend dostarczy schemat, przenosimy
 * ten interfejs do `backend/app/schemas/`, regenerujemy kontrakt i importujemy typ
 * z `@/types/api` — wtedy ta definicja znika.
 *
 * W trybie fixture'ów liczby pochodzą ze wspólnego `shared/fixtures/activity.json` (zliczenia
 * `action_type`), a nie z wpisanej na sztywno trójki — patrz `fixtures/activity.ts`.
 */
export interface LeaseActivityStats {
  push: number;
  review: number;
  comment: number;
}

export async function fetchActivityStats(lease_id: number): Promise<LeaseActivityStats> {
  if (shouldUseFixtures()) {
    const lease: LeaseOverview | undefined = leasesFixture.find(
      (candidate: LeaseOverview): boolean => candidate.id === lease_id,
    );

    // Bez backendu zegar stoi na kotwicy demo, więc zdarzenia z fixture'u liczą się w całości.
    return countActivityStats(lease, clockFixture.now);
  }

  return getJson<LeaseActivityStats>(`/api/v1/leases/${lease_id}/activity-stats`);
}
