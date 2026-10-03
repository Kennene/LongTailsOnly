import { leasesFixture } from '@/api/fixtures/leases';
import { advanceSimulatedClock, applyDecision, getLeases } from '@/test/msw/state';
import type { LeaseOverview } from '@/types/api';

/**
 * Dowód na liczby ze scenariuszy demo (`shared/scenarios/`), których nie da się pokazać
 * w teście widoku: symulacja backendu musi oddawać je co do dnia.
 *
 * Scenariusze wygrywają z przeliczeniem: `t0` to dokładnie snapshot z `shared/fixtures/`,
 * a skok zegara tylko go przesuwa.
 */

function leaseOf(leases: LeaseOverview[], login: string, repository: string): LeaseOverview {
  const lease = leases.find(
    (candidate: LeaseOverview): boolean =>
      candidate.user.login === login && candidate.repository.name === repository,
  );

  if (lease === undefined) {
    throw new Error(`Brak dzierżawy ${login}@${repository} w fixture`);
  }

  return lease;
}

describe('symulacja dzierżaw (MSW)', () => {
  it('na kotwicy demo oddaje dokładnie wspólne fixture’y dzierżaw', () => {
    // `status`, `days_remaining` i `recommendation` z shared/fixtures/leases*.json są
    // wartościami na kotwicę — symulacja nie może ich nadpisać własnym przeliczeniem.
    expect(getLeases()).toEqual(leasesFixture);
  });

  it('UC-02: kamil@payment-service jest WARNING z rekomendacją DOWNSCOPE', () => {
    const lease: LeaseOverview = leaseOf(getLeases(), 'kamil', 'payment-service');

    expect(lease).toMatchObject({
      status: 'WARNING',
      recommendation: 'DOWNSCOPE',
      current_role: 'write',
      days_remaining: 4,
    });
  });

  it('UC-04: kamil@core-api przechodzi ACTIVE → WARNING → EXPIRED', () => {
    expect(leaseOf(getLeases(), 'kamil', 'core-api')).toMatchObject({
      status: 'ACTIVE',
      days_remaining: 28,
      recommendation: 'KEEP',
    });

    advanceSimulatedClock(25);

    // Scenariusz podaje tu 4 dni; snapshot kotwicy ma 28 dni, więc +25 daje 3 — liczby
    // w `uc-04-time-travel.json` są o dzień niespójne same ze sobą (28 − 25 ≠ 4).
    expect(leaseOf(getLeases(), 'kamil', 'core-api')).toMatchObject({
      status: 'WARNING',
      days_remaining: 3,
    });

    advanceSimulatedClock(5);

    expect(leaseOf(getLeases(), 'kamil', 'core-api')).toMatchObject({
      status: 'EXPIRED',
      recommendation: 'KEEP',
    });
  });

  it('przedłużenie dokłada dni do snapshotu i nie gubi przesunięcia zegara', () => {
    const extended: LeaseOverview | null = applyDecision(1, {
      action: 'EXTEND',
      extension: { preset_days: 30 },
    });

    expect(extended).toMatchObject({ days_remaining: 58, status: 'ACTIVE' });
  });

  it('przedłużenie dzierżawy stałej liczy dni od czasu symulowanego', () => {
    advanceSimulatedClock(25);
    const permanent: LeaseOverview = leaseOf(getLeases(), 'tomasz-admin', 'core-api');

    expect(permanent.days_remaining).toBeNull();

    const extended: LeaseOverview | null = applyDecision(permanent.id, {
      action: 'EXTEND',
      extension: { preset_days: 30 },
    });

    expect(extended).toMatchObject({ expires_at: expect.any(String), days_remaining: 30 });
  });

  it('wyłączenie dzierżawy zostawia ją w stanie jako nieaktywną', () => {
    const updated: LeaseOverview | null = applyDecision(1, { action: 'REVOKE' });

    expect(updated).toMatchObject({ is_active: false });
    expect(leaseOf(getLeases(), 'kamil', 'core-api').is_active).toBe(false);
  });
});
