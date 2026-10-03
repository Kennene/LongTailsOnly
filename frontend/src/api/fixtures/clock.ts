import type { ClockRead } from '@/types/api';

/**
 * Fixture zegara symulowanego — pozwala uruchomić panel bez backendu
 * (`VITE_USE_FIXTURES=true`) i zobaczyć pasek czasu z konkretną datą.
 *
 * Data bazowa jest zgodna z seedem backendu (`TimeProvider` kotwiczy demo na `2026-10-03`).
 * Mutacje (podróż w czasie, reset scenariusza) zawsze idą do API — patrz `api/simulation.ts`.
 */
export const clockFixture: ClockRead = {
  now: '2026-10-03T00:00:00Z',
  offset_days: 0,
};
