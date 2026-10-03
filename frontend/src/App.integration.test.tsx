import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '@/App';
import { getSimulatedNow } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';

const ADMIN_ROW = /tomasz-admin/;
const LAST_ADMIN_MESSAGE = 'Nie można odebrać uprawnień ostatniemu administratorowi.';

/**
 * Przepływ pitch flow z `PLAN.md` Faza 4 w zakresie linii cięcia (UC-2, UC-4, UC-5):
 * stan wyjściowy → podróż w czasie → okno ostrzegawcze → próba odebrania uprawnień
 * ostatniemu administratorowi.
 *
 * Scenariusze po linii cięcia (odwołanie z decyzją, onboarding, graf, audyt) dokładamy
 * w kolejnych krokach — ten plik jest miejscem, w którym spotykają się wszystkie widoki.
 */
it('przeprowadza demo: podróż w czasie zmienia statusy i chroni ostatniego administratora', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/' });

  // 1. Stan wyjściowy — liczniki z API (4.6) i zielone dzierżawy.
  expect(await screen.findByTestId('kpi-active')).toHaveTextContent('12');
  expect(screen.getByTestId('kpi-warning')).toHaveTextContent('1');

  // 2. Podróż w czasie o 25 dni (UC-4) — własna liczba dni, bo presety to +15/+30/+60.
  await user.type(screen.getByLabelText('Własna liczba dni'), '25');
  await user.click(screen.getByRole('button', { name: 'Przesuń' }));
  await waitFor(() => expect(getSimulatedNow()).toBe('2026-10-28T00:00:00.000Z'));

  // 3. Dzierżawy: dzierżawa, która była zielona, wchodzi w okno ostrzegawcze (UC-2).
  await user.click(screen.getByRole('link', { name: 'Dzierżawy' }));
  expect(await screen.findByText('Pozostało 5 dni')).toBeInTheDocument();
  expect(screen.getAllByText('Wygasła').length).toBeGreaterThan(0);

  // 4. Ochrona ostatniego administratora (UC-5) — próba wyłączenia musi się skończyć 403.
  const adminRow = await screen.findByRole('row', { name: ADMIN_ROW });
  await user.click(within(adminRow).getByRole('button', { name: 'Decyzja' }));
  await user.click(await screen.findByRole('button', { name: 'Wyłącz' }));
  await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));

  expect(await screen.findByText(LAST_ADMIN_MESSAGE)).toBeInTheDocument();
});
