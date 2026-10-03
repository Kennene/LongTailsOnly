import type { ClockRead, DemoResetResult, TimeTravelRequest } from '@/types/api';

import { getJson, postJson } from './client';
import { shouldUseFixtures } from './config';
import { clockFixture } from './fixtures/clock';

export async function fetchClock(): Promise<ClockRead> {
  if (shouldUseFixtures()) {
    return clockFixture;
  }

  return getJson<ClockRead>('/api/v1/simulation/clock');
}

// Mutacje zawsze idą do API — tryb fixture'ów jest tylko odczytowym fallbackiem (ADR 0010).
export async function postTimeTravel(request: TimeTravelRequest): Promise<ClockRead> {
  return postJson<ClockRead, TimeTravelRequest>('/api/v1/simulation/time-travel', request);
}

/** Reset scenariusza demo: zeruje zegar i przywraca seed bazy. */
export async function postDemoReset(): Promise<DemoResetResult> {
  return postJson<DemoResetResult, Record<string, never>>('/api/v1/demo/reset', {});
}
