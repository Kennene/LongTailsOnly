import type { AppealRead } from '@/types/api';

/**
 * Fixture'y odwołań w kształcie kontraktu (`AppealRead` z `frontend/src/types/api.ts`).
 *
 * Trzymamy je jako literały TS z jawnym typem (jak `fixtures/leases.ts`), więc literówka
 * w nazwie pola albo status spoza unii `AppealStatus` jest błędem kompilacji.
 *
 * `AppealRead` niesie tylko `user_id` i `lease_id`, dlatego osobę i repozytorium widok
 * odwołań łączy z listą dzierżaw (`useLeases`) po `lease_id` — fixture celowo zawiera
 * odwołania do dzierżaw 1, 2 i 3, żeby to łączenie dało się sprawdzić.
 *
 * Kolejność: od najnowszego (`created_at` malejąco) — widok renderuje listę bez sortowania,
 * bo porównania dat należą do backendu, nie do frontendu.
 */
export const appealsFixture: AppealRead[] = [
  {
    id: 1,
    lease_id: 3,
    user_id: 4,
    repo_id: 3,
    requested_role: 'write',
    justification: 'Zamknięcie raportów kwartalnych w legacy-reports',
    status: 'PENDING',
    created_at: '2026-10-02T08:30:00Z',
    resolved_at: null,
  },
  {
    id: 2,
    lease_id: 2,
    user_id: 3,
    repo_id: 2,
    requested_role: 'read',
    justification: 'Testy regresji frontendu przed wydaniem 2.1',
    status: 'REJECTED',
    created_at: '2026-09-29T13:10:00Z',
    resolved_at: '2026-09-30T09:45:00Z',
  },
  {
    id: 3,
    lease_id: 1,
    user_id: 2,
    repo_id: 1,
    requested_role: 'write',
    justification: 'Dokończenie migracji modułu płatności',
    status: 'APPROVED',
    created_at: '2026-09-21T07:05:00Z',
    resolved_at: '2026-09-22T10:20:00Z',
  },
];
