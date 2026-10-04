import { leasesFixture } from '@/api/fixtures/leases';
import { advanceSimulatedClock, applyDecision, getLeases } from '@/test/msw/state';
import type { LeaseOverview } from '@/types/api';

/**
 * Dowód na liczby ze scenariuszy demo (`shared/scenarios/`), których nie da się pokazać
 * w teście widoku: symulacja backendu musi oddawać je co do dnia.
 *
 * Scenariusze wygrywają z przeliczeniem: `t0` to dokładnie snapshot z `shared/fixtures/`,
 * a skok zegara tylko go przesuwa. Jedyny wyjątek to rekomendacja dostępu po terminie —
 * `shared/scenarios/uc-04-time-travel.json` pinuje dla `EXPIRED` wartość `REVOKE`.
 */

function leaseOf(leases: LeaseOverview[], login: string, repository: string): LeaseOverview {
  const lease = leases.find(
    (candidate: LeaseOverview): boolean =>
      candidate.user.login === login && candidate.repository.name === repository,
  );

  if (lease === undefined) {
    throw new Error(`Brak dostępu ${login}@${repository} w fixture`);
  }

  return lease;
}

describe('symulacja dostępów (MSW)', () => {
  it('na kotwicy demo oddaje wspólne fixture’y dostępów, przeliczając rekomendację EXPIRED na REVOKE', () => {
    // `status` i `days_remaining` z shared/fixtures/leases*.json są wartościami na kotwicę —
    // symulacja nie może ich nadpisać własnym przeliczeniem. Rekomendacja to wyjątek:
    // `shared/scenarios/uc-04-time-travel.json` pinuje dla `EXPIRED` wartość `REVOKE`, a snapshot
    // kotwicy trzyma dla dwóch wygasłych dostępów `DOWNSCOPE` (shared/fixtures/leases-expired.json).
    const expected: LeaseOverview[] = leasesFixture.map((lease: LeaseOverview): LeaseOverview =>
      lease.status === 'EXPIRED' ? { ...lease, recommendation: 'REVOKE' } : lease,
    );

    expect(getLeases()).toEqual(expected);
  });

  it('UC-02: kamil@payment-service jest WARNING z rekomendacją DOWNSCOPE', () => {
    // shared/scenarios/uc-02-downscope.json: `then[0].expect` pinuje komplet pól tego dostępu.
    const lease: LeaseOverview = leaseOf(getLeases(), 'kamil', 'payment-service');

    expect(lease).toMatchObject({
      status: 'WARNING',
      recommendation: 'DOWNSCOPE',
      current_role: 'write',
      days_remaining: 4,
    });
  });

  it('UC-04: kamil@core-api przechodzi ACTIVE/KEEP → WARNING → EXPIRED/REVOKE', () => {
    // shared/scenarios/uc-04-time-travel.json: t0 `ACTIVE`+`KEEP`, t25 `WARNING`, t30
    // `EXPIRED`+`REVOKE`. Rekomendacji dla t25 scenariusz nie pinuje, więc zostaje ze snapshotu.
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
      recommendation: 'KEEP',
    });

    advanceSimulatedClock(5);

    expect(leaseOf(getLeases(), 'kamil', 'core-api')).toMatchObject({
      status: 'EXPIRED',
      recommendation: 'REVOKE',
    });
  });

  it('zamienia DOWNSCOPE na REVOKE dopiero wtedy, gdy dostęp przekroczy termin', () => {
    // Ta sama reguła co w UC-04, pinowana na dostępie z UC-02: `DOWNSCOPE` ze snapshotu zostaje
    // dopóki status jest `WARNING`, a po przekroczeniu terminu wchodzi `REVOKE`.
    advanceSimulatedClock(25);

    expect(leaseOf(getLeases(), 'kamil', 'payment-service')).toMatchObject({
      status: 'EXPIRED',
      recommendation: 'REVOKE',
    });
  });

  it('przedłużenie dokłada dni do snapshotu i nie gubi przesunięcia zegara', () => {
    const extended: LeaseOverview | null = applyDecision(1, {
      action: 'EXTEND',
      extension: { preset_days: 30 },
    });

    expect(extended).toMatchObject({ days_remaining: 58, status: 'ACTIVE' });
  });

  it('przedłużenie stałego dostępu liczy dni od czasu symulowanego', () => {
    advanceSimulatedClock(25);
    const permanent: LeaseOverview = leaseOf(getLeases(), 'tomasz-admin', 'core-api');

    expect(permanent.days_remaining).toBeNull();

    const extended: LeaseOverview | null = applyDecision(permanent.id, {
      action: 'EXTEND',
      extension: { preset_days: 30 },
    });

    expect(extended).toMatchObject({ expires_at: expect.any(String), days_remaining: 30 });
  });

  it('wyłączenie dostępu zostawia go w stanie jako nieaktywny', () => {
    const updated: LeaseOverview | null = applyDecision(1, { action: 'REVOKE' });

    expect(updated).toMatchObject({ is_active: false });
    expect(leaseOf(getLeases(), 'kamil', 'core-api').is_active).toBe(false);
  });
});
