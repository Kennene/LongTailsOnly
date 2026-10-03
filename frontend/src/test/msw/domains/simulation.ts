import { HttpResponse, http } from 'msw';
import type { HttpHandler } from 'msw';
import type { TimeTravelRequest } from '@/types/api';
import {
  advanceSimulatedClock,
  getSimulatedNow,
  getSimulatedOffsetDays,
  recordDemoReset,
} from '../state';

export const simulationHandlers: HttpHandler[] = [
  http.get('/api/v1/simulation/clock', () =>
    HttpResponse.json({ now: getSimulatedNow(), offset_days: getSimulatedOffsetDays() }),
  ),

  http.post('/api/v1/simulation/time-travel', async ({ request }) => {
    const body = (await request.json()) as TimeTravelRequest;
    advanceSimulatedClock(body.days);

    return HttpResponse.json({ now: getSimulatedNow(), offset_days: getSimulatedOffsetDays() });
  }),

  http.post('/api/v1/demo/reset', () => {
    recordDemoReset();

    return HttpResponse.json({
      now: getSimulatedNow(),
      offset_days: getSimulatedOffsetDays(),
      counts: { users: 21, repositories: 10, leases: 4 },
    });
  }),
];
