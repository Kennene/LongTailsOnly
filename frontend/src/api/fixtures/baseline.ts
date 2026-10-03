import type { BaselineResponse } from '@/api/baseline';

/**
 * Fixture'y standardu zespołu w kształtach oczekiwanego kontraktu 4.1/4.2 (patrz `@/api/baseline`).
 *
 * Wartości odtwarzają seed backendu (krok 1.5, `app/db/seed_data.py`), więc demo i testy widzą
 * ten sam świat co po dostarczeniu endpointu: próg **50% aktywnych członków zespołu w ostatnich
 * 30 dniach** (ADR 0005), proponowany poziom to najniższy poziom większości (`write`/`read`),
 * a `admin` nigdy nie wchodzi do standardu. `nowy-dev` (scenariusz D) nie ma jeszcze żadnych
 * dostępów, dlatego trafia na listę `new_members`.
 *
 * Trzymamy je jako literały TS z jawnym typem, a nie jako `.json`: brak pola albo literał spoza
 * unii `Role` jest wtedy błędem kompilacji, a nie pustą kolumną na demo.
 */
export const baselineFixture: Record<string, BaselineResponse | undefined> = {
  dev: {
    team: { id: 1, name: 'DEV', slug: 'dev' },
    entries: [
      {
        team_id: 1,
        repository: {
          id: 1,
          name: 'core-api',
          owner: 'longtails',
          default_branch: 'main',
          default_lease_duration_days: 30,
        },
        proposed_role: 'write',
        active_members: 11,
        team_size: 12,
      },
      {
        team_id: 1,
        repository: {
          id: 2,
          name: 'auth-service',
          owner: 'longtails',
          default_branch: 'main',
          default_lease_duration_days: 30,
        },
        proposed_role: 'write',
        active_members: 7,
        team_size: 12,
      },
      {
        team_id: 1,
        repository: {
          id: 3,
          name: 'payment-service',
          owner: 'longtails',
          default_branch: 'main',
          default_lease_duration_days: 30,
        },
        proposed_role: 'read',
        active_members: 8,
        team_size: 12,
      },
    ],
    new_members: [{ login: 'nowy-dev', name: 'Nowy Developer' }],
  },
  qa: {
    team: { id: 2, name: 'QA', slug: 'qa' },
    entries: [
      {
        team_id: 2,
        repository: {
          id: 9,
          name: 'qa-automation',
          owner: 'longtails',
          default_branch: 'main',
          default_lease_duration_days: 30,
        },
        proposed_role: 'read',
        active_members: 6,
        team_size: 6,
      },
    ],
    new_members: [],
  },
};

/** Zwraca fixture dla sluga zespołu albo `null` — tak samo, jak zrobiłby to `GET /baseline/{slug}`. */
export function findBaselineFixture(team_slug: string): BaselineResponse | null {
  return baselineFixture[team_slug] ?? null;
}
