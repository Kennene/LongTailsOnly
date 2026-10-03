import leasesJson from '@shared/fixtures/leases.json';
import expiredLeasesJson from '@shared/fixtures/leases-expired.json';

import type { LeaseOverview, LeaseStatus } from '@/types/api';

/**
 * Dostępy demo — **wspólne** dane z `shared/fixtures/`, a nie literał wymyślony na frontendzie.
 *
 * Dwa pliki, bo tak dzieli je seed: `leases.json` to 8 dostępów z terminem albo stałych, a
 * `leases-expired.json` to 7 wygasłych. Razem dają reprezentatywne **15 z 53** rekordów bazy
 * (`shared/fixtures/manifest.json`), pokrywające każdy status, każdą rolę i każdą rekomendację.
 *
 * Rzutowanie na `LeaseOverview[]` jest jedynym miejscem, w którym deklarujemy kształt: brak pola
 * albo literał spoza unii (`Role`, `LeaseStatus`, `Recommendation`) wywala `tsc`. Wartości pól
 * `status`, `days_remaining` i `recommendation` są zamrożone na kotwicy demo
 * (`2026-10-03T00:00:00Z`) — symulacja w `test/msw/state.ts` przesuwa je razem z zegarem.
 */

/**
 * Silnik dostępów (3.1) **liczy** status regułą `app/domain/lease_rules.py::lease_status`,
 * a wspólne fixture'y powstały przed nim i trzymają dla adminów `ACTIVE`. Stosujemy więc regułę
 * silnika także tutaj, żeby tryb offline pokazywał to samo, co `GET /api/v1/leases`:
 * `is_active: false` → `REVOKED`, admin albo brak terminu → `PERMANENT` (i bez `days_remaining`,
 * bo `lease_days_remaining` zwraca `None` dla statusów bez terminu).
 *
 * Statusów zależnych od zegara (`ACTIVE`/`WARNING`/`EXPIRED`) **nie** przeliczamy: zamrożone
 * wartości w fixture'ach są skalibrowane na seedowe „teraz" (12:00) i przeliczanie od kotwicy
 * rozjechałoby UC-02 (28 vs 30 dni) — przesuwa je dopiero symulacja w `test/msw/state.ts`.
 */
function withEngineStatus(lease: LeaseOverview): LeaseOverview {
  const status: LeaseStatus = !lease.is_active
    ? 'REVOKED'
    : lease.current_role === 'admin' || lease.expires_at === null
      ? 'PERMANENT'
      : lease.status;

  if (status === lease.status) {
    return lease;
  }

  const days_remaining: number | null =
    status === 'PERMANENT' || status === 'REVOKED' ? null : lease.days_remaining;

  return { ...lease, status, days_remaining };
}

export const currentLeasesFixture: LeaseOverview[] = (leasesJson as LeaseOverview[]).map(
  withEngineStatus,
);

/** Wygasłe dostępy z `leases-expired.json` — podzbiór używany przez widoki „po terminie”. */
export const expiredLeasesFixture: LeaseOverview[] = (expiredLeasesJson as LeaseOverview[]).map(
  withEngineStatus,
);

/** Pełny zbiór demo: 8 bieżących + 7 wygasłych = 15 rekordów, które widzi `GET /api/v1/leases`. */
export const leasesFixture: LeaseOverview[] = [...currentLeasesFixture, ...expiredLeasesFixture];
