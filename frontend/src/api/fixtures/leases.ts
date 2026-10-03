import leasesJson from '@shared/fixtures/leases.json';
import expiredLeasesJson from '@shared/fixtures/leases-expired.json';

import type { LeaseOverview } from '@/types/api';

/**
 * Dzierżawy demo — **wspólne** dane z `shared/fixtures/`, a nie literał wymyślony na frontendzie.
 *
 * Dwa pliki, bo tak dzieli je seed: `leases.json` to 8 dzierżaw z terminem albo stałych, a
 * `leases-expired.json` to 7 wygasłych. Razem dają reprezentatywne **15 z 53** rekordów bazy
 * (`shared/fixtures/manifest.json`), pokrywające każdy status, każdą rolę i każdą rekomendację.
 *
 * Rzutowanie na `LeaseOverview[]` jest jedynym miejscem, w którym deklarujemy kształt: brak pola
 * albo literał spoza unii (`Role`, `LeaseStatus`, `Recommendation`) wywala `tsc`. Wartości pól
 * `status`, `days_remaining` i `recommendation` są zamrożone na kotwicy demo
 * (`2026-10-03T00:00:00Z`) — symulacja w `test/msw/state.ts` przesuwa je razem z zegarem.
 */
export const currentLeasesFixture: LeaseOverview[] = leasesJson as LeaseOverview[];

/** Wygasłe dzierżawy z `leases-expired.json` — podzbiór używany przez widoki „po terminie”. */
export const expiredLeasesFixture: LeaseOverview[] = expiredLeasesJson as LeaseOverview[];

/** Pełny zbiór demo: 8 bieżących + 7 wygasłych = 15 rekordów, które widzi `GET /api/v1/leases`. */
export const leasesFixture: LeaseOverview[] = [...currentLeasesFixture, ...expiredLeasesFixture];
