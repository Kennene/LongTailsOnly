import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import type { LeaseActivityStats } from '@/api/activity';
import { countActivityStats } from '@/api/fixtures/activity';
import type { LeaseOverview } from '@/types/api';

import { getLeases, getSimulatedNow } from '../state';

/**
 * Handlery domeny „activity” — statystyki użycia per dzierżawa (oczekiwany kontrakt 4.4).
 *
 * Liczymy je ze wspólnego `shared/fixtures/activity.json` dla dzierżawy wskazanej w ścieżce,
 * biorąc parę `(user_id, repo_id)` z żywego stanu i odsiewając zdarzenia późniejsze niż zegar
 * symulowany — a nie z jednej, wpisanej liczby, która pasowałaby do każdej dzierżawy.
 */
export const activityHandlers: HttpHandler[] = [
  http.get('/api/v1/leases/:leaseId/activity-stats', ({ params }) => {
    const leaseId = Number(params.leaseId);
    const lease: LeaseOverview | undefined = getLeases().find(
      (candidate: LeaseOverview): boolean => candidate.id === leaseId,
    );
    const stats: LeaseActivityStats = countActivityStats(lease, getSimulatedNow());

    return HttpResponse.json(stats);
  }),
];
