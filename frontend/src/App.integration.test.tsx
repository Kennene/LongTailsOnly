import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { countDashboard, dashboardFixture } from '@/api/fixtures/dashboard';
import { leasesFixture } from '@/api/fixtures/leases';
import { App } from '@/App';
import { formatDaysRemaining } from '@/lib/dateTime';
import { getStatusBadge } from '@/lib/statusBadges';
import { getLeases, getSimulatedNow } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

const LAST_ADMIN_MESSAGE = 'Nie można odebrać uprawnień ostatniemu administratorowi.';

/** Administrator z fixture'ów (seed ma dokładnie jednego na repozytorium, ADR 0008). */
const ADMIN_LEASE: LeaseOverview | undefined = leasesFixture.find(
  (lease: LeaseOverview): boolean => lease.current_role === 'admin',
);

/** Dzierżawa w oknie ostrzegawczym po skoku +25 dni — najmniej dni, więc pierwsza do decyzji. */
function firstWarningAfterJump(): LeaseOverview {
  const warnings: LeaseOverview[] = getLeases()
    .filter((lease: LeaseOverview): boolean => lease.status === 'WARNING')
    .toSorted(
      (left: LeaseOverview, right: LeaseOverview): number =>
        (left.days_remaining ?? 0) - (right.days_remaining ?? 0),
    );

  return warnings[0];
}

/**
 * Przepływ pitch flow z `PLAN.md` Faza 4 w zakresie linii cięcia (UC-2, UC-4, UC-5):
 * stan wyjściowy → podróż w czasie → okno ostrzegawcze → próba odebrania uprawnień
 * ostatniemu administratorowi.
 *
 * Liczby bierzemy z tego samego źródła co widoki: `countDashboard` na stanie dzierżaw z
 * `shared/fixtures/leases*.json` (audyt: „Aktywne 12” przy czterech wierszach tabeli).
 *
 * Scenariusze po linii cięcia (odwołanie z decyzją, onboarding, graf, audyt) dokładamy
 * w kolejnych krokach — ten plik jest miejscem, w którym spotykają się wszystkie widoki.
 *
 * Limit czasu jest podniesiony świadomie: to jedyny test, który przechodzi całą ścieżkę pitch
 * flow (dwa widoki, podróż w czasie, modal decyzji), więc 5 s domyślnego `testTimeout` potrafi
 * pęknąć na zajętej maszynie. Nie skracamy przepływu — dokładamy jawny budżet.
 */
it('przeprowadza demo: podróż w czasie zmienia statusy i chroni ostatniego administratora', async () => {
  const user = userEvent.setup();
  expect(ADMIN_LEASE).toBeDefined();
  renderWithProviders(<App />, { route: '/' });

  // 1. Stan wyjściowy — liczniki z API (4.6) i dzierżawy z fixture'ów.
  const kpiActive: HTMLElement = await screen.findByTestId('kpi-active');
  expect(within(kpiActive).getByText(String(dashboardFixture.active))).toBeInTheDocument();
  expect(
    within(screen.getByTestId('kpi-warning')).getByText(String(dashboardFixture.warning)),
  ).toBeInTheDocument();

  // 2. Podróż w czasie o 25 dni (UC-4) — własna liczba dni, bo presety to +15/+30/+60.
  await user.type(screen.getByLabelText('Własna liczba dni'), '25');
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));
  await waitFor(() => expect(getSimulatedNow()).toBe('2026-10-28T00:00:00.000Z'));

  // 3. Dzierżawy: dzierżawa, która była zielona, wchodzi w okno ostrzegawcze (UC-2).
  await user.click(screen.getByRole('link', { name: 'Dzierżawy' }));
  const warning: LeaseOverview | undefined = firstWarningAfterJump();
  expect(warning).toBeDefined();
  expect(
    (await screen.findAllByText(formatDaysRemaining(warning.days_remaining))).length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText(getStatusBadge('EXPIRED').label).length).toBeGreaterThan(0);

  // Liczniki pulpitu też płyną z zegarem — inaczej podróż w czasie zmieniałaby tabelę, a nie KPI.
  await user.click(screen.getByRole('link', { name: 'Pulpit' }));
  await waitFor(() => {
    expect(
      within(screen.getByTestId('kpi-active')).getByText(
        String(countDashboard(getLeases(), getSimulatedNow()).active),
      ),
    ).toBeInTheDocument();
  });
  await user.click(screen.getByRole('link', { name: 'Dzierżawy' }));

  // 4. Ochrona ostatniego administratora (UC-5) — próba wyłączenia musi się skończyć 403.
  const adminRow: HTMLElement = await screen.findByRole('row', {
    name: new RegExp(
      `${ADMIN_LEASE?.user.login ?? ''}[\\s\\S]*${ADMIN_LEASE?.repository.name ?? ''}`,
    ),
  });
  await user.click(within(adminRow).getByRole('button', { name: 'Decyzja' }));
  await user.click(await screen.findByRole('button', { name: 'Wyłącz' }));
  await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));

  expect(await screen.findByText(LAST_ADMIN_MESSAGE)).toBeInTheDocument();
}, 15_000);
