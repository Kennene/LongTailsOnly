import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { activityStatsFixture } from '@/api/activity';

/**
 * Handlery domeny „activity” — statystyki użycia per dzierżawa (oczekiwany kontrakt 4.4).
 */
export const activityHandlers: HttpHandler[] = [
  http.get('/api/v1/leases/:leaseId/activity-stats', () => HttpResponse.json(activityStatsFixture)),
];
