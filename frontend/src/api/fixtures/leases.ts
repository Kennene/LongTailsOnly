import type { LeaseOverview } from '@/types/api';

/**
 * Fixture'y w kształcie kontraktu (`frontend/src/types/api.ts`, generowanego z Pydantic).
 *
 * Trzymamy je jako literały TS z jawnym typem, a nie jako pliki `.json`: dzięki temu
 * brak pola, literówka w nazwie albo literał spoza unii (`LeaseStatus`, `Role`, `Recommendation`)
 * jest **błędem kompilacji**, a nie pustą kolumną na demo. Gdy Osoba 6 dostarczy surowe JSON-y
 * (krok 6.1), opakowujemy je tutaj tym samym typem.
 *
 * Wartości bazują na seedzie backendu (`TimeProvider` kotwiczy demo na `2026-10-03T00:00:00Z`).
 */
export const leasesFixture: LeaseOverview[] = [
  {
    id: 1,
    user: {
      id: 2,
      login: 'kamil',
      name: 'Kamil Nowak',
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
    current_role: 'write',
    granted_at: '2026-09-20T00:00:00Z',
    expires_at: '2026-11-02T00:00:00Z',
    is_active: true,
    status: 'ACTIVE',
    days_remaining: 30,
    last_activity_at: '2026-10-02T09:15:00Z',
    recommendation: 'KEEP',
  },
  {
    id: 2,
    user: {
      id: 3,
      login: 'marta',
      name: 'Marta Zielińska',
      is_admin: false,
      team: { id: 2, name: 'QA', slug: 'qa' },
    },
    repository: {
      id: 2,
      name: 'frontend-app',
      owner: 'longtails',
      default_branch: 'main',
      default_lease_duration_days: 30,
    },
    current_role: 'read',
    granted_at: '2026-09-08T00:00:00Z',
    expires_at: '2026-10-08T00:00:00Z',
    is_active: true,
    status: 'WARNING',
    days_remaining: 5,
    last_activity_at: '2026-10-01T12:00:00Z',
    recommendation: 'DOWNSCOPE',
  },
  {
    id: 3,
    user: {
      id: 4,
      login: 'piotr',
      name: 'Piotr Lewandowski',
      is_admin: false,
      team: { id: 1, name: 'DEV', slug: 'dev' },
    },
    repository: {
      id: 3,
      name: 'legacy-reports',
      owner: 'longtails',
      default_branch: 'main',
      default_lease_duration_days: 30,
    },
    current_role: 'write',
    granted_at: '2026-08-01T00:00:00Z',
    expires_at: '2026-09-30T00:00:00Z',
    is_active: false,
    status: 'EXPIRED',
    days_remaining: -3,
    last_activity_at: null,
    recommendation: 'REVOKE',
  },
  {
    id: 4,
    user: {
      id: 1,
      login: 'tomasz-admin',
      name: 'Tomasz Wiśniewski',
      is_admin: true,
      team: null,
    },
    repository: {
      id: 4,
      name: 'infra-terraform',
      owner: 'longtails',
      default_branch: 'main',
      default_lease_duration_days: 30,
    },
    current_role: 'admin',
    granted_at: '2026-01-05T00:00:00Z',
    expires_at: null,
    is_active: true,
    status: 'ACTIVE',
    days_remaining: null,
    last_activity_at: '2026-09-29T08:00:00Z',
    recommendation: 'DOWNSCOPE',
  },
];
