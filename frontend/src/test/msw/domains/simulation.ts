import demoResetFixture from '@shared/fixtures/demo-reset.json';
import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import type {
  ActivityEventRead,
  ClockRead,
  DemoRefreshResult,
  DemoResetResult,
  SimulationClock,
  TimeTravelRequest,
  UserRead,
} from '@/types/api';

import {
  advanceSimulatedClock,
  getSimulatedNow,
  getSimulatedOffsetDays,
  recordDemoRefresh,
  recordDemoReset,
} from '../state';

/** Osoba spoza seeda, którą „pobiera” pierwsze odświeżenie (`backend/app/db/seed_data.py::REFRESH_USER`). */
export const REFRESHED_USER: UserRead = {
  id: 20,
  login: 'zofia',
  name: 'Zofia',
  team: { id: 1, slug: 'dev', name: 'DEV' },
  is_admin: false,
};

/** Aktywność z kolejnych odświeżeń: po jednym zdarzeniu na osobę, w chwili zegara symulowanego. */
function refreshedEvents(): ActivityEventRead[] {
  const timestamp = getSimulatedNow();

  return [
    {
      id: 101,
      user_id: 3,
      repo_id: 1,
      timestamp,
      action_type: 'PushEvent',
      required_permission: 'write',
    },
    {
      id: 102,
      user_id: 4,
      repo_id: 1,
      timestamp,
      action_type: 'PullRequestReviewEvent',
      required_permission: 'read',
    },
    {
      id: 103,
      user_id: 15,
      repo_id: 9,
      timestamp,
      action_type: 'IssueCommentEvent',
      required_permission: 'read',
    },
  ];
}

/**
 * Handlery domeny „symulacja” (zegar, podróż w czasie, reset i odświeżenie demo).
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

  // Tak jak backend (`app/services/demo_refresh_service.py`): pierwsze odświeżenie dodaje osobę,
  // każde kolejne przynosi aktywność zamiast niej.
  http.post('/api/v1/demo/refresh', () => {
    const result: DemoRefreshResult =
      recordDemoRefresh() === 1
        ? { added_users: [REFRESHED_USER], events: [] }
        : { added_users: [], events: refreshedEvents() };

    return HttpResponse.json(result);
  }),
];
