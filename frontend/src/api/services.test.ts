import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/client';
import { fetchServices } from '@/api/services';
import { server } from '@/test/msw/server';
import type { ServiceRead } from '@/types/api';

/**
 * Warstwa danych katalogu usług — kontrakt realnego backendu (`GET /api/v1/services`):
 * odpowiedzią jest **goła tablica** `ServiceRead` (bez koperty `{ services }`), a `capabilities`
 * przychodzą w kolejności deklaracji rejestru, **nie posortowane** — warstwa danych nie ma prawa
 * ich przestawiać ani filtrować.
 *
 * Testujemy tutaj, bo kopertę albo sortowanie łatwo „naprawić” po stronie konsumenta, a wtedy
 * frontend rozjeżdża się z backendem po cichu.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchServices', () => {
  it('reads the catalog from the API when fixtures are off', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'false');

    await expect(fetchServices()).resolves.toHaveLength(2);
  });

  it('returns the shared fixture when VITE_USE_FIXTURES is true', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');

    const services: ServiceRead[] = await fetchServices();

    expect(services.map((service: ServiceRead): string => service.id)).toEqual([
      'demo-tracker',
      'github',
    ]);
  });

  it('surfaces a 500 from the catalog endpoint as ApiError', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'false');
    server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));

    await expect(fetchServices()).rejects.toBeInstanceOf(ApiError);
  });
});
