import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { countDashboard, dashboardFixture } from '@/api/fixtures/dashboard';
import { leasesFixture } from '@/api/fixtures/leases';
import { formatDaysRemaining } from '@/lib/dateTime';
import { getStatusBadge } from '@/lib/statusBadges';
import { DashboardPage } from '@/pages/DashboardPage';
import { server } from '@/test/msw/server';
import { advanceSimulatedClock, getLeases, getSimulatedNow } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { DashboardStats, LeaseOverview } from '@/types/api';

const KPI_LABELS: string[] = [
  'Aktywne dzierżawy',
  'Ostrzeżenia',
  'Wygaśnięte',
  'Rekomendacje deeskalacji',
];

const WARNING_EMPTY =
  'Brak dzierżaw w oknie ostrzegawczym — użyj podróży w czasie, aby je wywołać.';

const KPI_TEST_IDS: string[] = ['kpi-active', 'kpi-warning', 'kpi-expired', 'kpi-downscope'];

/**
 * Oczekiwane liczniki liczymy z żywego stanu dzierżaw i zegara symulowanego — dokładnie z tego,
 * co widzi handler MSW. Żadna liczba nie jest przepisana drugi raz (audyt: „Aktywne 12”
 * przy czterech wierszach), a fixture pochodzi ze wspólnego `shared/fixtures/leases*.json`.
 */
function expectedCounters(): DashboardStats {
  return countDashboard(getLeases(), getSimulatedNow());
}

function zeroCounters(): DashboardStats {
  return {
    generated_at: getSimulatedNow(),
    active: 0,
    warning: 0,
    expired: 0,
    permanent: 0,
    revoked: 0,
    downscope_recommendations: 0,
    revoke_recommendations: 0,
    pending_appeals: 0,
    onboarding_candidates: 0,
  };
}

/** Dzierżawy w oknie ostrzegawczym w kolejności listy: najpilniejsze (najmniej dni) pierwsze. */
function warningLeases(leases: LeaseOverview[]): LeaseOverview[] {
  return leases
    .filter((lease: LeaseOverview): boolean => lease.status === 'WARNING')
    .toSorted(
      (left: LeaseOverview, right: LeaseOverview): number =>
        (left.days_remaining ?? 0) - (right.days_remaining ?? 0),
    );
}

function fullName(lease: LeaseOverview): string {
  return `${lease.repository.owner}/${lease.repository.name}`;
}

/** Licznik KPI to jedyny element karty, którego treścią jest sama liczba. */
function kpiValue(testId: string): HTMLElement {
  return within(screen.getByTestId(testId)).getByText(/^\d+$/);
}

/**
 * Porównanie musi być ścisłe: `toHaveTextContent('2')` przechodzi też dla „12”, czyli dokładnie
 * dla tej pomyłki, którą audyt znalazł na pulpicie.
 */
function expectKpi(testId: string, value: number): void {
  expect(kpiValue(testId).textContent).toBe(String(value));
}

/** Wiersze okna ostrzegawczego muszą zgadzać się z dzierżawami `WARNING` co do treści i kolejności. */
async function expectWarningWindow(section: HTMLElement, leases: LeaseOverview[]): Promise<void> {
  const expected: LeaseOverview[] = warningLeases(leases);

  if (expected.length === 0) {
    expect(within(section).queryAllByRole('link')).toHaveLength(0);
    return;
  }

  const rows: HTMLElement[] = await within(section).findAllByRole('link');

  expect(rows).toHaveLength(expected.length);

  expected.forEach((lease: LeaseOverview, index: number): void => {
    const row: HTMLElement = rows[index];

    expect(within(row).getByText(lease.user.name)).toBeInTheDocument();
    expect(within(row).getByText(fullName(lease))).toBeInTheDocument();
    expect(within(row).getByText(formatDaysRemaining(lease.days_remaining))).toBeInTheDocument();
    expect(within(row).getByText(getStatusBadge(lease.status).label)).toBeInTheDocument();
    expect(row).toHaveAttribute('href', '/leases');
  });
}

describe('DashboardPage', () => {
  it('renders the four KPI counters derived from the lease fixtures', async () => {
    const expected: DashboardStats = expectedCounters();
    renderWithProviders(<DashboardPage />);

    for (const label of KPI_LABELS) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }

    expectKpi('kpi-active', expected.active);
    expectKpi('kpi-warning', expected.warning);
    expectKpi('kpi-expired', expected.expired);
    expectKpi('kpi-downscope', expected.downscope_recommendations);
  });

  it('recounts the counters from the live lease state after the simulated clock moves', async () => {
    advanceSimulatedClock(25);

    const expected: DashboardStats = expectedCounters();
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('kpi-active')).toBeInTheDocument();
    expectKpi('kpi-active', expected.active);
    expectKpi('kpi-warning', expected.warning);
    expectKpi('kpi-expired', expected.expired);

    // Podróż w czasie musi zmienić liczby — inaczej liczniki nie płyną z zegara symulowanego.
    expect(expected.active).not.toBe(dashboardFixture.active);
    expect(expected.expired).not.toBe(dashboardFixture.expired);
  });

  it('renders zeros when the API returns empty counters', async () => {
    server.use(http.get('/api/v1/dashboard', () => HttpResponse.json(zeroCounters())));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('kpi-warning')).toBeInTheDocument();

    for (const testId of KPI_TEST_IDS) {
      expectKpi(testId, 0);
    }
  });

  it('shows an error state whose retry button refetches the counters', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/dashboard', () => HttpResponse.json({ detail: 'Boom' }, { status: 500 })),
    );
    renderWithProviders(<DashboardPage />);

    const alert: HTMLElement = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nie udało się pobrać liczników');
    expect(screen.getByRole('button', { name: 'Odśwież' })).toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Odśwież' }));

    expect(await screen.findByTestId('kpi-active')).toBeInTheDocument();
    expectKpi('kpi-active', expectedCounters().active);
  });

  it('replaces the counters and the warning window with skeletons while they are loading', async () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getAllByTestId('kpi-skeleton')).toHaveLength(4);
    expect(screen.getByTestId('warning-window-skeleton')).toBeInTheDocument();

    await screen.findByTestId('kpi-active');

    expect(screen.queryAllByTestId('kpi-skeleton')).toHaveLength(0);
    expect(screen.queryByTestId('warning-window-skeleton')).not.toBeInTheDocument();
  });

  it('lists the leases in the warning window with their days remaining', async () => {
    renderWithProviders(<DashboardPage />);

    const section: HTMLElement = await screen.findByTestId('warning-window');

    expect(within(section).getByText('W oknie ostrzegawczym')).toBeInTheDocument();
    await expectWarningWindow(section, getLeases());
  });

  it('keeps active leases out of the warning window', async () => {
    renderWithProviders(<DashboardPage />);

    const section: HTMLElement = await screen.findByTestId('warning-window');
    const warningUsers = new Set<string>(
      warningLeases(leasesFixture).map((lease: LeaseOverview): string => lease.user.login),
    );
    const activeLease: LeaseOverview | undefined = leasesFixture.find(
      (lease: LeaseOverview): boolean =>
        lease.status === 'ACTIVE' && !warningUsers.has(lease.user.login),
    );

    expect(activeLease).toBeDefined();
    expect((await within(section).findAllByRole('link')).length).toBeGreaterThan(0);
    expect(within(section).queryByText(activeLease?.user.name ?? '')).not.toBeInTheDocument();
  });

  it('moves the warning window with the simulated clock', async () => {
    advanceSimulatedClock(25);
    renderWithProviders(<DashboardPage />);

    const section: HTMLElement = await screen.findByTestId('warning-window');

    // Po skoku okno zawiera inne dzierżawy: te, którym zostało 1–7 dni.
    await expectWarningWindow(section, getLeases());
    expect(warningLeases(getLeases())[0].id).not.toBe(warningLeases(leasesFixture)[0].id);
  });

  it('teaches that the warning window is empty instead of showing an empty list', async () => {
    server.use(http.get('/api/v1/leases', () => HttpResponse.json([])));
    renderWithProviders(<DashboardPage />);

    const section: HTMLElement = await screen.findByTestId('warning-window');

    expect(await within(section).findByText(WARNING_EMPTY)).toBeInTheDocument();
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps the counters when the warning window fails and retries the leases', async () => {
    const user = userEvent.setup();
    let isFailing = true;
    server.use(
      http.get('/api/v1/leases', () =>
        isFailing
          ? HttpResponse.json({ detail: 'Boom' }, { status: 500 })
          : HttpResponse.json(getLeases()),
      ),
    );
    renderWithProviders(<DashboardPage />);

    const section: HTMLElement = await screen.findByTestId('warning-window');
    expect(await within(section).findByText('Nie udało się pobrać dzierżaw')).toBeInTheDocument();
    expectKpi('kpi-active', expectedCounters().active);

    isFailing = false;
    await user.click(within(section).getByRole('button', { name: 'Odśwież' }));

    await expectWarningWindow(section, getLeases());
  });
});
