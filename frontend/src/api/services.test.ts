import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/client';
import { servicesFixture } from '@/api/fixtures';
import { fetchServices } from '@/api/services';
import {
  SERVICE_REGISTRY,
  type ServiceRoute,
  type ServiceRouteId,
  SHARED_ROUTE_IDS,
} from '@/services/serviceRegistry';
import { server } from '@/test/msw/server';
import type { ServiceRead } from '@/types/api';

/**
 * Warstwa danych katalogu usług — kontrakt realnego backendu (`GET /api/v1/services`): odpowiedzią
 * jest **goła tablica** `ServiceRead` (bez koperty `{ services }`).
 *
 * Kolejności `capabilities` ten plik nie pinuje i nie musi: backend normalizuje ją do porządku
 * posortowanego (`ServiceRead.from_descriptor`), więc nie niesie ona znaczenia, a konsument —
 * rejestr frontendu — porównuje zbiory. Testujemy tutaj kształt odpowiedzi i ścieżkę błędu, bo
 * kopertę `{ services }` łatwo „naprawić” po stronie konsumenta, a wtedy frontend rozjeżdża się
 * z backendem po cichu.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchServices', () => {
  it('reads the catalog from the API when fixtures are off', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'false');

    // Liczba z fixture'a, nie literał: dodanie usługi nie wymaga edycji tego testu.
    await expect(fetchServices()).resolves.toHaveLength(servicesFixture.length);
  });

  it('returns the shared fixture when VITE_USE_FIXTURES is true', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');

    const services: ServiceRead[] = await fetchServices();

    expect(services.map((service: ServiceRead): string => service.id)).toEqual(
      servicesFixture.map((service: ServiceRead): string => service.id),
    );
  });

  it('surfaces a 500 from the catalog endpoint as ApiError', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'false');
    server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));

    await expect(fetchServices()).rejects.toBeInstanceOf(ApiError);
  });
});

/**
 * Zgodność rejestrów (spec §7.4) — oczekiwany zbiór **wyliczamy z fixture'a**, a nie z drugiego
 * ręcznie utrzymywanego literału, więc rejestr frontendu i dane, na których pracuje backend, mają
 * jedno współdzielone źródło.
 *
 * **Granica tej gwarancji, nazwana wprost:** ten test porównuje rejestr z `shared/fixtures/`
 * `services.json`, a **nie z żywym backendem** — testy frontendu nie mają uruchomionego API i tego
 * nie udają. Fixture jest tu właściwą kotwicą, bo jest jedynym artefaktem wspólnym dla obu stron:
 * `tests/contract/test_fixtures_match_contract.py` waliduje jego **kształt** modelem `ServiceRead`
 * (tym samym, który generuje kontrakt), a `tests/api/test_services.py` pinuje jego **wartości**
 * literałem sześciu capabilities. Łańcuch jest więc: backend pinuje wartości → fixture je
 * odzwierciedla → ten test porównuje z nimi rejestr frontendu. Rozjazd nazw tras jest błędem testu,
 * nie pustą pozycją na demo.
 */
describe('registry conformance', () => {
  it('declares exactly the github capabilities the shared fixture advertises', () => {
    const github: ServiceRead | undefined = servicesFixture.find(
      (service: ServiceRead): boolean => service.id === 'github',
    );

    // Trasy wspólne (`/mocks`) nie są capability żadnej usługi — backend ich nie wymienia, więc
    // porównujemy wyłącznie trasy własne GitHuba. Równość (a nie zawieranie) zostaje, żeby
    // nadmiarowa trasa w rejestrze nadal była błędem.
    expect(new Set(github?.capabilities)).toEqual(
      new Set(
        SERVICE_REGISTRY.github.routes
          .map((route: ServiceRoute): ServiceRouteId => route.id)
          .filter((id: ServiceRouteId): boolean => !SHARED_ROUTE_IDS.includes(id)),
      ),
    );
  });
});
