import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '@/App';
import { renderWithProviders } from '@/test/renderWithProviders';

const NAV_LABELS = ['Pulpit', 'Dostępy', 'Odwołania', 'Standard zespołu', 'Graf', 'Audyt'];

it('renders navigation for all six views and switches route', async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/' });

  for (const label of NAV_LABELS) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  }

  await user.click(screen.getByRole('link', { name: 'Dostępy' }));

  expect(await screen.findByRole('heading', { name: 'Dostępy' })).toBeInTheDocument();
});

it('mounts the simulated clock bar in the top bar', () => {
  renderWithProviders(<App />, { route: '/' });

  expect(screen.getByTestId('time-travel-bar')).toBeInTheDocument();
});
