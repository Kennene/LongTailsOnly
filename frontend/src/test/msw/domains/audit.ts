import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import type { AuditLogResponse } from '@/api/audit';
import { auditFixture } from '@/api/fixtures/audit';

/**
 * Handlery domeny „audit” (dziennik audytu). Zadanie 5.10.
 *
 * Odczyt zwraca fixture'y w kształcie oczekiwanego kontraktu 4.5 (`{ entries: AuditLogRead[] }`).
 * Dziennik jest tylko do odczytu, więc handlery nie trzymają stanu i nie wymagają resetu —
 * testy nadpisują je przez `server.use`, gdy potrzebują pustego lub błędnego dziennika.
 */
export const auditHandlers: HttpHandler[] = [
  http.get('/api/v1/audit', () => {
    const response: AuditLogResponse = { entries: auditFixture };

    return HttpResponse.json(response);
  }),
];
