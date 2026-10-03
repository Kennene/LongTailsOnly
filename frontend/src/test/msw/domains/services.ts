import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { servicesFixture } from '@/api/fixtures/services';

/**
 * Handlery domeny „usługi” — `GET /api/v1/services` (katalog pickera, zadanie 6).
 *
 * Katalog zwracamy wprost ze wspólnego fixture'u (`shared/fixtures/services.json`), żeby demo bez
 * backendu i testy miały jedno źródło prawdy. Handler jest obowiązkowy, dopóki `ServicesProvider`
 * odpala `useServices()` przy każdym renderze: `test/setup.ts` ustawia `onUnhandledRequest:
 * 'error'`, więc brak tej trasy wywala **każdy** test montujący provider, a nie tylko testy usług.
 */
export const servicesHandlers: HttpHandler[] = [
  http.get('/api/v1/services', () => HttpResponse.json(servicesFixture)),
];
