import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import type { DashboardCounters } from '@/api/dashboard';
import { countDashboard } from '@/api/fixtures/dashboard';
import { leasesFixture } from '@/api/fixtures/leases';
import { DashboardPage } from '@/pages/DashboardPage';
import { server } from '@/test/msw/server';
import { advanceSimulatedClock, getLeases } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

const KPI_LABELS: string[] = [
  'Aktywne dzierżawy',
  'Ostrzeżenia',
  'Wygaśnięte',
  'Rekomendacje deeskalacji',
];

const WARNING_EMPTY =
  'Brak dzierżaw w oknie ostrzegawczym — użyj podróży w czasie, aby je wywołać.';

const ZERO_COUNTERS: DashboardCounters = {
  active: 0,
  warning: 0,
  expired: 0,
  downscope_recommendations: 0,
};

/**
 * Oczekiwane liczniki liczymy z fixture'a dzierżaw, a nie przepisujemy liczb: pulpitu i tabeli
 * `/leases` nie może rozjechać żadna zmiana seedu (audyt: „Aktywne 12” przy czterech wierszach).
 */
function countFromFixture(): DashboardCounters {
  return {
    active: leasesFixture.filter((lease: LeaseOverview): boolean => lease.status === 'ACTIVE')
      .length,
    warning: leasesFixture.filter((lease: LeaseOverview): boolean => lease.status === 'WARNING')
      .length,
    expired: leasesFixture.filter((lease: LeaseOverview): boolean => lease.status === 'EXPIRED')
      .length,
    downscope_recommendations: leasesFixture.filter(
      (lease: LeaseOverview): boolean => lease.recommendation === 'DOWNSCOPE',
    ).length,
  };
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

describe('DashboardPage', () => {
  it('renders the four KPI counters derived from the lease fixtures', async () => {
    const expected: DashboardCounters = countFromFixture();
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

    const expected: DashboardCounters = countDashboard(getLeases());
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('kpi-active')).toBeInTheDocument();
    expectKpi('kpi-active', expected.active);
    expectKpi('kpi-warning', expected.warning);
    expectKpi('kpi-expired', expected.expired);

    // Podróż w czasie musi zmienić liczby — inaczej liczniki nie płyną z zegara symulowanego.
    expect(expected.active).not.toBe(countFromFixture().active);
    expect(expected.expired).not.toBe(countFromFixture().expired);
  });

  it('renders zeros when the API returns empty counters', async () => {
    server.use(http.get('/api/v1/dashboard', () => HttpResponse.json(ZERO_COUNTERS)));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('kpi-warning')).toBeInTheDocument();

    for (const testId of ['kpi-active', 'kpi-warning', 'kpi-expired', 'kpi-downscope']) {
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
    expectKpi('kpi-active', countFromFixture().active);
  });

  it('replaces the counters and the warning window with skeletons while they are loading', async () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getAllByTestId('kpi-skeleton')).toHaveLength(4);
    expect(screen.getByTestId('warning-window-skeleton')).toBeInTheDocument();

    await screen.findByTestId('kpi-active');

    expect(screen.queryAllByTestId('kpi-skeleton')).toHaveLength(0);
    expect(await screen.findByRole('link', { name: /Marta Zielińska/ })).toBeInTheDocument();
    expect(screen.queryByTestId('warning-window-skeleton')).not.toBeInTheDocument();
  });

  it('lists the leases in the warning window with their days remaining', async () => {
    renderWithProviders(<DashboardPage />);

    const section: HTMLElement = await screen.findByTestId('warning-window');

    expect(within(section).getByText('W oknie ostrzegawczym')).toBeInTheDocument();
    // Na starcie demo w oknie ostrzegawczym jest tylko dzierżawa Marty (5 dni do końca).
    const row: HTMLElement = await within(section).findByRole('link', { name: /Marta Zielińska/ });
    expect(within(row).getByText('Pozostało 5 dni')).toBeInTheDocument();
    expect(within(row).getByText('longtails/frontend-app')).toBeInTheDocument();
    expect(within(row).getByText('Wygasa wkrótce')).toBeInTheDocument();
    expect(row).toHaveAttribute('href', '/leases');
    expect(within(section).queryByText('Kamil Nowak')).not.toBeInTheDocument();
  });

  it('moves the warning window with the simulated clock', async () => {
    advanceSimulatedClock(25);
    renderWithProviders(<DashboardPage />);

    const section: HTMLElement = await screen.findByTestId('warning-window');

    expect(await within(section).findByRole('link', { name: /Kamil Nowak/ })).toBeInTheDocument();
    expect(within(section).queryByText('Marta Zielińska')).not.toBeInTheDocument();
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
    expectKpi('kpi-active', countFromFixture().active);

    isFailing = false;
    await user.click(within(section).getByRole('button', { name: 'Odśwież' }));

    expect(
      await within(section).findByRole('link', { name: /Marta Zielińska/ }),
    ).toBeInTheDocument();
  });
});
