import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { auditFixture } from '@/api/fixtures/audit';
import type { AuditEntry } from '@/types/api';

/**
 * Handlery domeny „audit” (dziennik audytu). Zadanie 5.10.
 *
 * `GET /api/v1/audit` oddaje **gołą tablicę** `AuditEntry[]` (bez koperty `{ entries }`),
 * najnowsze wpisy pierwsze, a `actor_login` dokłada backend (LEFT JOIN z `users`). Dziennik jest
 * tylko do odczytu, więc handlery nie trzymają stanu i nie wymagają resetu — testy nadpisują je
 * przez `server.use`, gdy potrzebują pustego lub błędnego dziennika.
 */
export const auditHandlers: HttpHandler[] = [
  http.get('/api/v1/audit', () => {
    const entries: AuditEntry[] = auditFixture;

    return HttpResponse.json(entries);
  }),
];
