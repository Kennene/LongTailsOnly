import { http, type HttpHandler, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/client';
import { fetchDashboard } from '@/api/dashboard';
import { countDashboard, dashboardFixture } from '@/api/fixtures/dashboard';
import { server } from '@/test/msw/server';
import { advanceSimulatedClock, getLeases, getSimulatedNow } from '@/test/msw/state';
import type { DashboardStats } from '@/types/api';

/**
 * Warstwa danych pulpitu: backend serwuje `GET /api/v1/dashboard/stats` (kontraktowy
 * `DashboardStats`), więc `fetchDashboard()` nie liczy już niczego po stronie frontendu i nie
 * zagląda do listy dzierżaw, zegara ani odwołań — jedno żądanie, jedna odpowiedź.
 *
 * Testujemy tutaj, bo widok pokazuje cztery z dziewięciu liczników: `permanent`, `revoked`,
 * `pending_appeals`, `onboarding_candidates` i `generated_at` nigdzie nie trafiają, a właśnie one
 * najłatwiej rozjeżdżają się z regułą backendu (`app/domain/insights.py::compute_dashboard_counters`).
 */

/** Liczniki, które oddaje „backend” — ta sama reguła co `insights_service.get_dashboard_stats`. */
function statsPayload(): DashboardStats {
  return countDashboard(getLeases(), getSimulatedNow());
}

/** Trasa spoza `fetchDashboard`: wołanie jej to regres do liczenia liczników po stronie frontendu. */
function forbidRoute(path: string, calls: string[]): HttpHandler {
  return http.get(path, () => {
    calls.push(path);
    return HttpResponse.json({ detail: `${path} not found` }, { status: 404 });
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchDashboard', () => {
  it('czyta liczniki z GET /api/v1/dashboard/stats i nie pyta o dzierżawy, zegar ani odwołania', async () => {
    const paths: string[] = [];
    const derivedPaths: string[] = [];
    server.use(
      http.get('/api/v1/dashboard/stats', ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return HttpResponse.json(statsPayload());
      }),
      forbidRoute('/api/v1/leases', derivedPaths),
      forbidRoute('/api/v1/simulation/clock', derivedPaths),
      forbidRoute('/api/v1/appeals', derivedPaths),
    );

    const stats: DashboardStats = await fetchDashboard();

    expect(paths).toEqual(['/api/v1/dashboard/stats']);
    expect(derivedPaths).toEqual([]);
    expect(stats).toEqual(statsPayload());
    expect(stats.generated_at).toBe(getSimulatedNow());
  });

  it('przepuszcza odpowiedź serwera co do znaku, bez nadpisywania liczników', async () => {
    // `pending_appeals` był jedynym licznikiem, który frontend nadpisywał własnym odczytem
    // odwołań; teraz cała dziewiątka pól idzie na ekran dokładnie taka, jaka przyszła z API.
    const payload: DashboardStats = {
      generated_at: '2026-12-24T00:00:00Z',
      active: 42,
      warning: 7,
      expired: 1,
      permanent: 3,
      revoked: 2,
      downscope_recommendations: 5,
      revoke_recommendations: 6,
      pending_appeals: 4,
      onboarding_candidates: 9,
    };
    server.use(http.get('/api/v1/dashboard/stats', () => HttpResponse.json(payload)));

    await expect(fetchDashboard()).resolves.toEqual(payload);
  });

  it('przesuwa generated_at i liczniki razem z zegarem symulowanym', async () => {
    advanceSimulatedClock(25);

    const stats: DashboardStats = await fetchDashboard();

    expect(stats.generated_at).toBe(getSimulatedNow());
    expect(stats).toEqual(statsPayload());
  });

  it('zwraca 404 z serwera jako błąd, a nie cichy fallback na ścieżkę pochodną', async () => {
    const derivedPaths: string[] = [];
    server.use(
      http.get('/api/v1/dashboard/stats', () =>
        HttpResponse.json({ detail: 'Not Found' }, { status: 404 }),
      ),
      forbidRoute('/api/v1/leases', derivedPaths),
    );

    const error: unknown = await fetchDashboard().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
    // Brakujący endpoint nie może po cichu wracać do liczenia liczników z listy dzierżaw.
    expect(derivedPaths).toEqual([]);
  });

  it('w trybie VITE_USE_FIXTURES oddaje fixture i nie pyta API', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');
    const calls: string[] = [];
    server.use(forbidRoute('/api/v1/dashboard/stats', calls));

    const stats: DashboardStats = await fetchDashboard();

    expect(stats).toEqual(dashboardFixture);
    expect(calls).toEqual([]);
  });
});
