import type { LeaseActivityStats, LeaseOverview } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { countActivityStats } from './fixtures/activity';
import { clockFixture } from './fixtures/clock';
import { leasesFixture } from './fixtures/leases';

/**
 * Statystyki użycia dzierżawy dla modala decyzji (UC-3) — odpowiedź
 * `GET /api/v1/leases/{lease_id}/activity-stats` (krok backendu 3.6).
 *
 * Typ pochodzi wprost z generowanego kontraktu (`src/types/api.ts`, ADR 0009) i **nie jest**
 * definiowany tutaj: `LeaseActivityStats` z `backend/app/schemas/lease.py` opisuje okno
 * (`window_days`, `window_start`, `window_end`) i `last_activity_at`, więc własny interfejs
 * rozjechałby się z backendem po cichu.
 *
 * W trybie fixture'ów (brak backendu) tę samą odpowiedź buduje `countActivityStats`
 * z `shared/fixtures/activity.json` — w tym samym kształcie, z oknem dzierżawy i zegarem demo.
 */
export async function fetchActivityStats(lease_id: number): Promise<LeaseActivityStats> {
  if (shouldUseFixtures()) {
    const lease: LeaseOverview | undefined = leasesFixture.find(
      (candidate: LeaseOverview): boolean => candidate.id === lease_id,
    );

    // Bez backendu zegar stoi na kotwicy demo, więc zdarzenia z fixture'u liczą się w całości.
    return countActivityStats(lease_id, lease, clockFixture.now);
  }

  return getJson<LeaseActivityStats>(`/api/v1/leases/${lease_id}/activity-stats`);
}
