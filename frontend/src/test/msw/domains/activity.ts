import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { countActivityStats } from '@/api/fixtures/activity';
import type { LeaseActivityStats, LeaseOverview } from '@/types/api';

import { getLeases, getSimulatedNow } from '../state';

/**
 * Handlery domeny „activity” — statystyki użycia per dzierżawa w kształcie kontraktu
 * `LeaseActivityStats` (`backend/app/schemas/lease.py`, krok 3.6).
 *
 * Liczymy je ze wspólnego `shared/fixtures/activity.json` dla dzierżawy wskazanej w ścieżce,
 * biorąc parę `(user_id, repo_id)` z żywego stanu i odsiewając zdarzenia późniejsze niż zegar
 * symulowany — a nie z jednej, wpisanej liczby, która pasowałaby do każdej dzierżawy. Dzięki
 * temu okno (`window_days`, `window_start`) i liczniki przesuwają się razem z podróżą w czasie.
 *
 * Nieznana dzierżawa to `404`, tak jak w backendzie (`lease_service.get_lease`).
 */
export const activityHandlers: HttpHandler[] = [
  http.get('/api/v1/leases/:leaseId/activity-stats', ({ params }) => {
    const leaseId: number = Number(params.leaseId);
    const lease: LeaseOverview | undefined = getLeases().find(
      (candidate: LeaseOverview): boolean => candidate.id === leaseId,
    );

    if (lease === undefined) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 });
    }

    const stats: LeaseActivityStats = countActivityStats(leaseId, lease, getSimulatedNow());

    return HttpResponse.json(stats);
  }),
];
