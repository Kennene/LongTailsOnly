import type { AppealOverview } from '@/types/api';

/**
 * Fixture'y odwołań w kształcie realnego kontraktu (`AppealOverview`, UC-3, ADR 0011 §4).
 *
 * Wiersze bazowe (id, lease_id, user_id, repo_id, requested_role, justification, status,
 * created_at, resolved_at) są **przepisane 1:1** z `shared/fixtures/appeals.json` — tej samej
 * tablicy, na której jedzie backendowy seed i scenariusz `uc-03-appeal-flow`. Pola wyliczane
 * przez backend (`user`, `repository`, `lease_role`, `lease_expires_at`, `lease_is_active`,
 * `days_remaining`, `previous_appeals`, `recent_activity_count`) uzupełniamy z sąsiednich
 * fixture'ów: `shared/fixtures/{leases,users,repositories,activity}.json`.
 *
 * Trzymamy je jako literały TS z jawnym typem (jak `fixtures/leases.ts`), więc brak pola,
 * literówka w nazwie albo literał spoza unii jest **błędem kompilacji**, a nie pustą kolumną.
 *
 * Wartości `days_remaining` i `recent_activity_count` bierzemy z fixture'ów źródłowych, mimo że
 * ich kotwica czasu (`2026-10-03T00:00:00Z`) różni się o kilka dni od `expires_at` — frontend
 * tych liczb nie przelicza (liczy je backend), a demo ma pokazywać te same dane co seed.
 *
 * Kolejność: od najnowszego (`created_at` malejąco) — widok renderuje listę bez sortowania,
 * bo porównania dat należą do backendu, nie do frontendu.
 */
export const appealsFixture: AppealOverview[] = [
  {
    id: 1,
    lease_id: 5,
    user_id: 14,
    repo_id: 9,
    requested_role: 'read',
    justification:
      'W przyszłym tygodniu prowadzę testy regresyjne wydania v2.1 — muszę mieć dostęp do zgłoszeń i wyników QA.',
    status: 'PENDING',
    created_at: '2026-10-02T09:15:00Z',
    resolved_at: null,
    user: {
      id: 14,
      login: 'marta',
      name: 'Marta',
      is_admin: false,
      team: { id: 2, name: 'QA', slug: 'qa' },
    },
    repository: {
      id: 9,
      name: 'qa-automation',
      owner: 'longtails',
      default_branch: 'main',
      default_lease_duration_days: 30,
    },
    lease_role: 'read',
    lease_expires_at: '2026-10-06T10:00:00Z',
    lease_is_active: true,
    days_remaining: 2,
    previous_appeals: 0,
    recent_activity_count: 1,
  },
  {
    id: 2,
    lease_id: 3,
    user_id: 2,
    repo_id: 3,
    requested_role: 'write',
    justification:
      'Zamykam migrację płatności; zostały dwie poprawki do wypchnięcia przed końcem sprintu.',
    status: 'APPROVED',
    created_at: '2026-09-28T08:00:00Z',
    resolved_at: '2026-09-29T11:30:00Z',
    user: {
      id: 2,
      login: 'kamil',
      name: 'Kamil',
      is_admin: false,
      team: { id: 1, name: 'DEV', slug: 'dev' },
    },
    repository: {
      id: 3,
      name: 'payment-service',
      owner: 'longtails',
      default_branch: 'main',
      default_lease_duration_days: 30,
    },
    lease_role: 'write',
    lease_expires_at: '2026-10-08T10:00:00Z',
    lease_is_active: true,
    days_remaining: 4,
    previous_appeals: 1,
    recent_activity_count: 3,
  },
  {
    id: 3,
    lease_id: 1,
    user_id: 2,
    repo_id: 1,
    requested_role: 'write',
    justification: 'Wdrożenie endpointu zwrotów wymaga jeszcze dwóch pushy w tym tygodniu.',
    status: 'REJECTED',
    created_at: '2026-09-20T14:05:00Z',
    resolved_at: '2026-09-21T09:00:00Z',
    user: {
      id: 2,
      login: 'kamil',
      name: 'Kamil',
      is_admin: false,
      team: { id: 1, name: 'DEV', slug: 'dev' },
    },
    repository: {
      id: 1,
      name: 'core-api',
      owner: 'longtails',
      default_branch: 'main',
      default_lease_duration_days: 30,
    },
    lease_role: 'write',
    lease_expires_at: '2026-11-01T10:00:00Z',
    lease_is_active: true,
    days_remaining: 28,
    previous_appeals: 0,
    recent_activity_count: 2,
  },
];
