import type { AuditEntry } from '@/types/api';

/**
 * Fixture'y dziennika audytu w kształcie kontraktu (`AuditEntry` z `frontend/src/types/api.ts`).
 *
 * Cztery wiersze to `shared/fixtures/audit.json` — ten sam zestaw zdarzeń, który opisuje demo.
 * `actor_login` dokładamy tak, jak dokłada go backend: `list_audit_entries` robi LEFT JOIN
 * z `users` (`backend/app/services/audit_service.py`), więc wiersze SYSTEM mają `null`.
 * Loginy pochodzą z `shared/fixtures/users.json` (1 → `tomasz-admin`, 2 → `kamil`).
 *
 * Kolejność jest ta, którą oddaje backend — **najnowsze pierwsze** (`timestamp` malejąco, przy
 * remisie `id` malejąco), bo dwa wpisy dzielą `2026-10-03T00:05:00Z`.
 */
export const auditFixture: AuditEntry[] = [
  {
    id: 4,
    timestamp: '2026-10-03T00:05:00Z',
    actor_type: 'SYSTEM',
    actor_id: null,
    actor_login: null,
    action: 'DOWNSCOPE_RECOMMENDED',
    target: 'kamil@frontend-app',
    details: { recommendation: 'DOWNSCOPE', from_role: 'write', to_role: 'read' },
    justification: null,
  },
  {
    id: 1,
    timestamp: '2026-10-03T00:05:00Z',
    actor_type: 'SYSTEM',
    actor_id: null,
    actor_login: null,
    action: 'LEASE_EXPIRED',
    target: 'kamil@legacy-reports',
    details: { recommendation: 'REVOKE', days_remaining: -61, current_role: 'write' },
    justification: null,
  },
  {
    id: 2,
    timestamp: '2026-09-29T11:30:00Z',
    actor_type: 'ADMIN',
    actor_id: 1,
    actor_login: 'tomasz-admin',
    action: 'APPEAL_APPROVED',
    target: 'kamil@payment-service',
    details: { lease_id: 3, preset_days: 30, requested_role: 'write' },
    justification:
      'Zamykam migrację płatności; zostały dwie poprawki do wypchnięcia przed końcem sprintu.',
  },
  {
    id: 3,
    timestamp: '2026-09-28T08:00:00Z',
    actor_type: 'USER',
    actor_id: 2,
    actor_login: 'kamil',
    action: 'APPEAL_SUBMITTED',
    target: 'kamil@payment-service',
    details: { lease_id: 3, requested_role: 'write' },
    justification:
      'Zamykam migrację płatności; zostały dwie poprawki do wypchnięcia przed końcem sprintu.',
  },
];
