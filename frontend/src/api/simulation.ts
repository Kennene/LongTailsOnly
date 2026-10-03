import type { ClockRead, DemoResetResult, SimulationClock, TimeTravelRequest } from '@/types/api';

import { getJson, postJson } from './client';
import { shouldUseFixtures } from './config';
import { clockFixture } from './fixtures/clock';

/**
 * Bieżący czas symulowany. `GET /simulation/clock` oddaje `SimulationClock` (`simulated_now`),
 * a mutacje `ClockRead` (`now`) — mapujemy tu, żeby pasek czasu i hooki zostały przy jednym
 * kształcie `ClockRead`.
 */
export async function fetchClock(): Promise<ClockRead> {
  if (shouldUseFixtures()) {
    return clockFixture;
  }

  const clock: SimulationClock = await getJson<SimulationClock>('/api/v1/simulation/clock');

  return { now: clock.simulated_now, offset_days: clock.offset_days };
}

// Mutacje zawsze idą do API — tryb fixture'ów jest tylko odczytowym fallbackiem (ADR 0015).
export async function postTimeTravel(request: TimeTravelRequest): Promise<ClockRead> {
  return postJson<ClockRead, TimeTravelRequest>('/api/v1/simulation/time-travel', request);
}

/** Reset scenariusza demo: zeruje zegar i przywraca seed bazy. */
export async function postDemoReset(): Promise<DemoResetResult> {
  return postJson<DemoResetResult, Record<string, never>>('/api/v1/demo/reset', {});
}
