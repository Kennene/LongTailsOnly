import demoResetFixture from '@shared/fixtures/demo-reset.json';
import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import type { ClockRead, DemoResetResult, SimulationClock, TimeTravelRequest } from '@/types/api';

import {
  advanceSimulatedClock,
  getSimulatedNow,
  getSimulatedOffsetDays,
  recordDemoReset,
} from '../state';

/**
 * Handlery domeny „symulacja” (zegar, podróż w czasie, reset demo).
 *
 * Odczyt zegara oddaje `SimulationClock` (`simulated_now`), a mutacje `ClockRead` (`now`) —
 * dokładnie tak, jak backend (`app/api/v1/simulation.py`). Odpowiedzi są typowane generowanym
 * kontraktem, więc podmiana nazwy pola w schemacie wywala ten plik już w `tsc`, a nie dopiero
 * jako pusta data na pasku czasu.
 */
export const simulationHandlers: HttpHandler[] = [
  http.get('/api/v1/simulation/clock', () => {
    const clock: SimulationClock = {
      simulated_now: getSimulatedNow(),
      offset_days: getSimulatedOffsetDays(),
    };

    return HttpResponse.json(clock);
  }),

  http.post('/api/v1/simulation/time-travel', async ({ request }) => {
    const body = (await request.json()) as TimeTravelRequest;
    advanceSimulatedClock(body.days);

    const clock: ClockRead = { now: getSimulatedNow(), offset_days: getSimulatedOffsetDays() };

    return HttpResponse.json(clock);
  }),

  http.post('/api/v1/demo/reset', () => {
    recordDemoReset();

    const result: DemoResetResult = {
      now: getSimulatedNow(),
      offset_days: getSimulatedOffsetDays(),
      // Liczniki bierzemy z kanonicznego fixture'u (`shared/fixtures/demo-reset.json`), żeby nie
      // rozjechały się z seedem backendu — wcześniej były wpisane z ręki i kłamały (21/10/4).
      counts: demoResetFixture.counts,
    };

    return HttpResponse.json(result);
  }),
];
