import { http, type HttpHandler, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchDashboard } from '@/api/dashboard';
import { appealsFixture } from '@/api/fixtures';
import { countDashboard, dashboardFixture } from '@/api/fixtures/dashboard';
import { server } from '@/test/msw/server';
import { advanceSimulatedClock, getLeases, getSimulatedNow } from '@/test/msw/state';
import type { DashboardStats } from '@/types/api';

/**
 * Warstwa danych pulpitu: backend **nie serwuje** `GET /api/v1/dashboard` (krok 4.6B), więc
 * `fetchDashboard()` liczy liczniki po stronie frontendu z danych, które API już oddaje —
 * `GET /api/v1/leases`, `GET /api/v1/simulation/clock` i jednej strony `GET /api/v1/appeals`.
 *
 * Testujemy tutaj, bo widok pokazuje cztery z dziewięciu liczników: `permanent`, `revoked`,
 * `pending_appeals`, `onboarding_candidates` i `generated_at` nigdzie nie trafiają, a właśnie one
 * najłatwiej rozjeżdżają się z regułą backendu (`app/domain/insights.py::compute_dashboard_counters`).
 */

/** Trasa, której backend jeszcze nie ma: wołanie jej to regres, a nie powód do cichego fallbacku. */
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
  it('liczy liczniki z listy dzierżaw, zegara i jednej strony odwołań', async () => {
    const appealsRequests: string[] = [];
    server.use(
      http.get('/api/v1/appeals', ({ request }) => {
        appealsRequests.push(new URL(request.url).pathname);
        return HttpResponse.json(appealsFixture);
      }),
    );

    const stats: DashboardStats = await fetchDashboard();

    expect(appealsRequests).toEqual(['/api/v1/appeals']);
    expect(stats).toEqual(countDashboard(getLeases(), getSimulatedNow()));
    expect(stats.generated_at).toBe(getSimulatedNow());
  });

  it('nie woła brakującego GET /api/v1/dashboard (krok 4.6B)', async () => {
    const calls: string[] = [];
    server.use(
      forbidRoute('/api/v1/dashboard', calls),
      forbidRoute('/api/v1/dashboard/stats', calls),
    );

    const stats: DashboardStats = await fetchDashboard();

    expect(calls).toEqual([]);
    expect(stats.active).toBe(countDashboard(getLeases(), getSimulatedNow()).active);
  });

  it('bierze pending_appeals z odpowiedzi GET /api/v1/appeals, nie z fixture', async () => {
    server.use(http.get('/api/v1/appeals', () => HttpResponse.json([])));

    const stats: DashboardStats = await fetchDashboard();

    expect(stats.pending_appeals).toBe(0);
    expect(stats).toEqual({
      ...countDashboard(getLeases(), getSimulatedNow()),
      pending_appeals: 0,
    });
  });

  it('przesuwa generated_at i statusy razem z zegarem symulowanym', async () => {
    advanceSimulatedClock(25);
    server.use(forbidRoute('/api/v1/dashboard', []));

    const stats: DashboardStats = await fetchDashboard();

    expect(stats.generated_at).toBe(getSimulatedNow());
    expect(stats).toEqual(countDashboard(getLeases(), getSimulatedNow()));
  });

  it('w trybie VITE_USE_FIXTURES oddaje fixture i nie pyta API', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');
    const calls: string[] = [];
    server.use(forbidRoute('/api/v1/leases', calls), forbidRoute('/api/v1/appeals', calls));

    const stats: DashboardStats = await fetchDashboard();

    expect(stats).toEqual(dashboardFixture);
    expect(calls).toEqual([]);
  });
});
