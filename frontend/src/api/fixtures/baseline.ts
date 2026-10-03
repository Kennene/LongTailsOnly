import type { BaselineEntry, OnboardingProposal } from '@/types/api';

/**
 * Fixture'y standardu zespołu i onboardingu (UC-1) w kształcie kontraktu z `@/types/api`.
 *
 * Wartości odwzorowują `shared/fixtures/baseline.json` (a przez niego seed backendu): próg **50%
 * aktywnych członków zespołu w ostatnich 30 dniach** (ADR 0005), proponowany poziom to najniższy
 * poziom większości (`write`/`read`), a `admin` nigdy nie wchodzi do standardu. Slugi zespołów
 * (`dev`, `qa`) pochodzą z `shared/fixtures/teams.json`.
 *
 * `nowy-dev` (scenariusz D, ADR 0008) nie ma żadnej aktywnej dzierżawy, więc cały standard DEV
 * trafia do `to_grant`, a `already_granted` jest puste — dokładnie tak, jak liczy to backend
 * (`get_onboarding_proposal`, ADR 0011 §5.2).
 *
 * Literały TS z jawnym typem, a nie `.json`: brak pola albo literał spoza unii `Role` jest wtedy
 * błędem kompilacji, a nie pustą kolumną na demo.
 */
const devBaseline: BaselineEntry[] = [
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
    active_members: 10,
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
    active_members: 6,
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
    active_members: 7,
    team_size: 12,
  },
];

export const baselineFixture: Record<string, BaselineEntry[] | undefined> = {
  dev: devBaseline,
  qa: [
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
};

export const onboardingFixture: Record<string, OnboardingProposal | undefined> = {
  'nowy-dev': {
    user: {
      id: 13,
      login: 'nowy-dev',
      name: 'Nowy Developer',
      team: { id: 1, slug: 'dev', name: 'DEV' },
      is_admin: false,
    },
    team: { id: 1, slug: 'dev', name: 'DEV' },
    to_grant: devBaseline,
    already_granted: [],
  },
};

/** Standard zespołu z `GET /api/v1/teams/{slug}/baseline`; `null` to 404 nieznanego zespołu. */
export function findTeamBaselineFixture(team_slug: string): BaselineEntry[] | null {
  return baselineFixture[team_slug] ?? null;
}

/** Propozycja onboardingu z `GET /api/v1/onboarding/{login}`; `null` to 404 nieznanego loginu. */
export function findOnboardingFixture(login: string): OnboardingProposal | null {
  return onboardingFixture[login] ?? null;
}
