import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, type HttpHandler, HttpResponse } from 'msw';

import { countDashboard, dashboardFixture } from '@/api/fixtures/dashboard';
import { leasesFixture } from '@/api/fixtures/leases';
import type { LeaseGroup } from '@/components/leases/leaseGroups';
import { formatRepositoryCount, groupLeasesByUser } from '@/components/leases/leaseGroups';
import { formatDaysRemaining } from '@/lib/dateTime';
import { getStatusBadge } from '@/lib/statusBadges';
import { DashboardPage } from '@/pages/DashboardPage';
import { server } from '@/test/msw/server';
import { advanceSimulatedClock, getLeases, getSimulatedNow } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { DashboardStats, LeaseOverview } from '@/types/api';

const KPI_LABELS: string[] = [
  'Aktywne dostępy',
  'Ostrzeżenia',
  'Wygaśnięte',
  'Rekomendacje deeskalacji',
];

const WARNING_EMPTY =
  'Brak dostępów w oknie ostrzegawczym — użyj podróży w czasie, aby je wywołać.';

const KPI_TEST_IDS: string[] = ['kpi-active', 'kpi-warning', 'kpi-expired', 'kpi-downscope'];

/**
 * Oczekiwane liczniki liczymy z żywego stanu dostępów i zegara symulowanego — dokładnie z tego,
 * co widzi handler MSW (`GET /api/v1/dashboard/stats`). Żadna liczba nie jest przepisana drugi raz
 * (audyt: „Aktywne 12” przy czterech wierszach), a fixture pochodzi ze wspólnego
 * `shared/fixtures/leases*.json`.
 */
function expectedCounters(): DashboardStats {
  return countDashboard(getLeases(), getSimulatedNow());
}

/** Trasa, której backend nie serwuje: wołanie jej to regres, nie powód do cichego fallbacku. */
function forbidRoute(path: string, calls: string[]): HttpHandler {
  return http.get(path, () => {
    calls.push(path);
    return HttpResponse.json({ detail: `${path} not found` }, { status: 404 });
  });
}

/** Dostępy w oknie ostrzegawczym w kolejności listy: najpilniejsze (najmniej dni) pierwsze. */
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

/**
 * Tożsamość wiersza to para (osoba, repozytorium), nie sama osoba: ta sama osoba może mieć
 * jeden dostęp w oknie ostrzegawczym, a drugi zupełnie zdrowy — i tak jest w fixture'ach.
 */
function pairOf(lease: LeaseOverview): string {
  return `${lease.user.login}@${lease.repository.name}`;
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

/** Przełącznik grupy osoby — etykieta niesie nazwę, więc kolejność grup czytamy z etykiet. */
const GROUP_TOGGLE = /^Pokaż dostępy: /;

/** Rozwija wszystkie grupy okna ostrzegawczego (repozytoria są domyślnie zwinięte). */
async function expandWarningWindow(section: HTMLElement): Promise<void> {
  await userEvent.setup().click(within(section).getByRole('button', { name: 'Rozwiń wszystkie' }));
}

/**
 * Okno ostrzegawcze pokazuje jedną grupę na osobę (kolejność jak w `groupLeasesByUser`), a po
 * rozwinięciu — dostępy `WARNING` tej osoby jako linki do `/leases`, w tej samej kolejności.
 */
async function expectWarningWindow(section: HTMLElement, leases: LeaseOverview[]): Promise<void> {
  const groups: LeaseGroup[] = groupLeasesByUser(warningLeases(leases));

  if (groups.length === 0) {
    expect(within(section).queryAllByRole('link')).toHaveLength(0);
    expect(within(section).queryAllByRole('button', { name: GROUP_TOGGLE })).toHaveLength(0);
    return;
  }

  const toggles: HTMLElement[] = await within(section).findAllByRole('button', {
    name: GROUP_TOGGLE,
  });
  expect(
    toggles.map((toggle: HTMLElement): string | null => toggle.getAttribute('aria-label')),
  ).toEqual(groups.map((group: LeaseGroup): string => `Pokaż dostępy: ${group.user.name}`));
  expect(within(section).queryAllByRole('link')).toHaveLength(0);

  await expandWarningWindow(section);
  const expected: LeaseOverview[] = groups.flatMap(
    (group: LeaseGroup): LeaseOverview[] => group.leases,
  );
  const rows: HTMLElement[] = within(section).getAllByRole('link');

  expect(rows).toHaveLength(expected.length);

  expected.forEach((lease: LeaseOverview, index: number): void => {
    const row: HTMLElement = rows[index];

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

  it('pokazuje liczniki z GET /api/v1/dashboard/stats, a nie policzone z listy dostępów', async () => {
    const paths: string[] = [];
    const legacyPaths: string[] = [];
    // Liczby celowo różne od reguły liczonej z dostępów: gdyby widok nadal liczył je sam,
    // karty pokazałyby `expectedCounters()`, a nie tę odpowiedź.
    const payload: DashboardStats = {
      ...expectedCounters(),
      active: 42,
      warning: 7,
      expired: 1,
      downscope_recommendations: 5,
    };
    server.use(
      http.get('/api/v1/dashboard/stats', ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return HttpResponse.json(payload);
      }),
      forbidRoute('/api/v1/dashboard', legacyPaths),
    );

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('kpi-active')).toBeInTheDocument();
    expectKpi('kpi-active', 42);
    expectKpi('kpi-warning', 7);
    expectKpi('kpi-expired', 1);
    expectKpi('kpi-downscope', 5);
    expect(paths).toEqual(['/api/v1/dashboard/stats']);
    expect(legacyPaths).toEqual([]);
    expect(payload.active).not.toBe(expectedCounters().active);
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

  it('mówi na karcie „Wygaśnięte”, z jakiego okna liczy backend', async () => {
    // Okno pochodzi z odpowiedzi (`expired_window_days`), nie z literału w widoku: gdyby ktoś
    // zmienił `EXPIRED_WINDOW_DAYS` w backendzie, karta nie może dalej kłamać „30 dni”.
    const payload: DashboardStats = {
      ...expectedCounters(),
      expired: 4,
      expired_window_days: 14,
    };
    server.use(http.get('/api/v1/dashboard/stats', () => HttpResponse.json(payload)));

    renderWithProviders(<DashboardPage />);

    const card: HTMLElement = await screen.findByTestId('kpi-expired');
    expectKpi('kpi-expired', 4);
    expect(within(card).getByText('Wygasłe w ostatnich 14 dniach')).toBeInTheDocument();
  });

  it('pokazuje zera, gdy backend oddaje zerowe liczniki', async () => {
    const zeros: DashboardStats = {
      generated_at: getSimulatedNow(),
      active: 0,
      warning: 0,
      expired: 0,
      expired_window_days: 30,
      permanent: 0,
      revoked: 0,
      downscope_recommendations: 0,
      revoke_recommendations: 0,
      pending_appeals: 0,
      onboarding_candidates: 0,
    };
    server.use(http.get('/api/v1/dashboard/stats', () => HttpResponse.json(zeros)));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('kpi-warning')).toBeInTheDocument();

    for (const testId of KPI_TEST_IDS) {
      expectKpi(testId, 0);
    }
  });

  it('pokazuje błąd liczników, gdy GET /api/v1/dashboard/stats odpowiada 404, i ponawia odczyt', async () => {
    const user = userEvent.setup();
    let statsMissing: boolean = true;
    server.use(
      http.get('/api/v1/dashboard/stats', () =>
        statsMissing
          ? HttpResponse.json({ detail: 'Not Found' }, { status: 404 })
          : HttpResponse.json(expectedCounters()),
      ),
    );
    renderWithProviders(<DashboardPage />);

    // Brak endpointu jest błędem widoku: żadnego cichego fallbacku na liczenie z listy dostępów.
    const alert: HTMLElement = await screen.findByTestId('kpi-error');
    expect(alert).toHaveTextContent('Nie udało się pobrać liczników');
    expect(screen.queryByTestId('kpi-active')).not.toBeInTheDocument();

    statsMissing = false;
    await user.click(within(alert).getByRole('button', { name: 'Odśwież' }));

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
    const warningPairs = new Set<string>(
      warningLeases(getLeases()).map((lease: LeaseOverview): string => pairOf(lease)),
    );
    const activeLease: LeaseOverview | undefined = getLeases().find(
      (lease: LeaseOverview): boolean =>
        lease.status === 'ACTIVE' && !warningPairs.has(pairOf(lease)),
    );

    expect(activeLease).toBeDefined();
    expect(
      (await within(section).findAllByRole('button', { name: GROUP_TOGGLE })).length,
    ).toBeGreaterThan(0);
    await expandWarningWindow(section);
    expect(
      within(section).queryByText(activeLease === undefined ? '' : fullName(activeLease)),
    ).not.toBeInTheDocument();
  });

  it('moves the warning window with the simulated clock', async () => {
    advanceSimulatedClock(25);
    renderWithProviders(<DashboardPage />);

    const section: HTMLElement = await screen.findByTestId('warning-window');

    // Po skoku okno zawiera inne dostępy: te, którym zostało 1–7 dni.
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

  it('rozłącza liczniki od listy dostępów: awaria dostępów nie zabiera KPI', async () => {
    const user = userEvent.setup();
    let leasesFailing: boolean = true;
    server.use(
      http.get('/api/v1/leases', () =>
        leasesFailing
          ? HttpResponse.json({ detail: 'Boom' }, { status: 500 })
          : HttpResponse.json(getLeases()),
      ),
    );
    renderWithProviders(<DashboardPage />);

    // Liczniki czytają `GET /api/v1/dashboard/stats`, a okno ostrzegawcze listę dostępów — każda
    // sekcja ma własny alert i własne „Odśwież”, więc awaria listy nie zabiera liczb z ekranu.
    const section: HTMLElement = await screen.findByTestId('warning-window');
    expect(await within(section).findByText('Nie udało się pobrać dostępów')).toBeInTheDocument();

    expect(await screen.findByTestId('kpi-active')).toBeInTheDocument();
    expectKpi('kpi-active', expectedCounters().active);
    expect(screen.queryByTestId('kpi-error')).not.toBeInTheDocument();

    leasesFailing = false;
    await user.click(within(section).getByRole('button', { name: 'Odśwież' }));

    await expectWarningWindow(section, getLeases());
    expectKpi('kpi-active', expectedCounters().active);
  });

  it('rozłącza listę dostępów od liczników: awaria KPI nie zabiera okna ostrzegawczego', async () => {
    const user = userEvent.setup();
    let statsFailing: boolean = true;
    server.use(
      http.get('/api/v1/dashboard/stats', () =>
        statsFailing
          ? HttpResponse.json({ detail: 'Boom' }, { status: 500 })
          : HttpResponse.json(expectedCounters()),
      ),
    );
    renderWithProviders(<DashboardPage />);

    const countersError: HTMLElement = await screen.findByTestId('kpi-error');
    expect(countersError).toHaveTextContent('Nie udało się pobrać liczników');

    const section: HTMLElement = await screen.findByTestId('warning-window');
    await expectWarningWindow(section, getLeases());

    statsFailing = false;
    await user.click(within(countersError).getByRole('button', { name: 'Odśwież' }));

    expect(await screen.findByTestId('kpi-active')).toBeInTheDocument();
    expectKpi('kpi-active', expectedCounters().active);
  });
});

it('collapses the warning window to one row per person with a repository count and urgency', async () => {
  const user = userEvent.setup();
  renderWithProviders(<DashboardPage />);

  const section: HTMLElement = await screen.findByTestId('warning-window');
  const [group]: LeaseGroup[] = groupLeasesByUser(warningLeases(getLeases()));
  const toggle: HTMLElement = await within(section).findByRole('button', {
    name: `Pokaż dostępy: ${group.user.name}`,
  });

  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(within(section).getAllByText(group.user.name)).toHaveLength(1);
  // Zwinięte okno nie pokazuje statusów — należą do repozytoriów, nie do osoby.
  expect(within(section).queryByText(getStatusBadge('WARNING').label)).not.toBeInTheDocument();
  expect(
    within(section).getAllByText(formatRepositoryCount(group.leases.length)).length,
  ).toBeGreaterThan(0);

  await user.click(toggle);

  expect(
    within(section).getByRole('button', { name: `Ukryj dostępy: ${group.user.name}` }),
  ).toHaveAttribute('aria-expanded', 'true');
  for (const lease of group.leases) {
    expect(within(section).getByText(fullName(lease))).toBeInTheDocument();
  }
});
