import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { ServiceRouteGuard } from '@/services/ServiceRouteGuard';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ServiceRead } from '@/types/api';

const STORAGE_KEY = 'lease-governor.service';

/** Katalog bez `github` — integracja wyrejestrowana, a w `localStorage` został stary zapis. */
const DEMO_TRACKER_ONLY: ServiceRead[] = [
  {
    id: 'demo-tracker',
    name: 'Demo Tracker (integracja demonstracyjna)',
    kind: 'issue_tracker',
    capabilities: ['dashboard', 'audit'],
    is_available: false,
  },
];

/**
 * Lokalny fixture tras: znaczniki pozwalają poznać, który widok wyrenderował strażnik.
 * Kopia w teście pickera (zadanie 7) jest świadoma — wspólny moduł testowy byłby abstrakcją
 * dla dwóch wywołań.
 */
function GuardedRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<ServiceRouteGuard />}>
        <Route path="/" element={<p data-testid="dashboard-marker">Pulpit</p>} />
        <Route path="/audit" element={<p data-testid="audit-marker">Audyt</p>} />
        <Route path="/leases" element={<p data-testid="leases-marker">Dzierżawy</p>} />
      </Route>
    </Routes>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('ServiceRouteGuard', () => {
  it('redirects a view the active service does not serve', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'demo-tracker');
    renderWithProviders(<GuardedRoutes />, { route: '/leases' });

    expect(await screen.findByTestId('dashboard-marker')).toBeInTheDocument();
  });

  it('keeps a view both services serve', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'demo-tracker');
    renderWithProviders(<GuardedRoutes />, { route: '/audit' });

    expect(await screen.findByTestId('audit-marker')).toBeInTheDocument();
  });

  it('renders a github-only view when github is active', async () => {
    // Ten test przypina też brak decyzji w trakcie wczytywania katalogu: pierwszy render widzi
    // placeholder, więc przekierowanie przed rozwiązaniem zapytania wyrzuciłoby użytkownika
    // z `/leases` mimo aktywnego `github`.
    window.localStorage.setItem(STORAGE_KEY, 'github');
    renderWithProviders(<GuardedRoutes />, { route: '/leases' });

    expect(await screen.findByTestId('leases-marker')).toBeInTheDocument();
  });

  it('lands on the dashboard instead of looping when the catalog is empty', async () => {
    server.use(http.get('/api/v1/services', () => HttpResponse.json([])));
    renderWithProviders(<GuardedRoutes />, { route: '/leases' });

    expect(await screen.findByTestId('dashboard-marker')).toBeInTheDocument();
  });

  it('degrades a deep link to the dashboard when the catalog request fails', async () => {
    server.use(http.get('/api/v1/services', () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<GuardedRoutes />, { route: '/leases' });

    expect(await screen.findByTestId('dashboard-marker')).toBeInTheDocument();
  });

  it('degrades a stale github deep link when the catalog omits github', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'github');
    server.use(http.get('/api/v1/services', () => HttpResponse.json(DEMO_TRACKER_ONLY)));
    renderWithProviders(<GuardedRoutes />, { route: '/leases' });

    expect(await screen.findByTestId('dashboard-marker')).toBeInTheDocument();
  });
});
