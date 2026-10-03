import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '@/App';
import { renderWithProviders } from '@/test/renderWithProviders';

const NAV_LABELS = ['Pulpit', 'Dostępy', 'Odwołania', 'Standard zespołu', 'Graf', 'Audyt', 'Mocki'];

it('renders navigation for all seven views and switches route', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/' });

  // Od zadania 7 nawigacja pochodzi z tras aktywnej usługi, a ta istnieje dopiero po
  // rozstrzygnięciu katalogu (`ServicesProvider` pyta `GET /api/v1/services`). Asercja bez zmian:
  // przy domyślnym `github` ma być sześć pozycji — czekamy tylko, aż katalog dotrze.
  for (const label of NAV_LABELS) {
    expect(await screen.findByRole('link', { name: label })).toBeInTheDocument();
  }

  await user.click(screen.getByRole('link', { name: 'Dostępy' }));

  expect(await screen.findByRole('heading', { name: 'Dostępy' })).toBeInTheDocument();
});

it('keeps the simulated clock out of the top bar', () => {
  renderWithProviders(<App />, { route: '/' });

  expect(screen.queryByRole('button', { name: 'Przesuń' })).not.toBeInTheDocument();
});

it('opens the mocks view with the simulated clock from the navigation', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/' });

  await user.click(screen.getByRole('link', { name: 'Mocki' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Mocki' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Przesuń' })).toBeInTheDocument();
});

it('offers the demo refresh from the top bar and announces the fetched user', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/' });

  await user.click(screen.getByRole('button', { name: 'Odśwież dane' }));

  expect(
    await screen.findByText('Dodano użytkownika Zofia (zofia) do zespołu DEV'),
  ).toBeInTheDocument();
});
