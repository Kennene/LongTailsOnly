import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BaselinePage } from '@/pages/BaselinePage';
import { getLastBaselineApproval } from '@/test/msw/domains/baseline';
import { renderWithProviders } from '@/test/renderWithProviders';

// Kopia testów z planu (Zadanie 9, kroki 1-2) — bez żadnych zmian.
it('renders baseline entries for both teams and never proposes admin', async () => {
  renderWithProviders(<BaselinePage />);

  expect(await screen.findByRole('heading', { name: 'Zespół DEV' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Zespół QA' })).toBeInTheDocument();
  expect(screen.getAllByText('Zapis (write)').length).toBeGreaterThan(0);
  expect(screen.queryByText('Administrator')).not.toBeInTheDocument();
});

it('approves the team standard for the selected new member', async () => {
  const user = userEvent.setup();
  renderWithProviders(<BaselinePage />);

  await user.click(await screen.findByRole('button', { name: 'Zatwierdź standard' }));
  await waitFor(() =>
    expect(getLastBaselineApproval()).toMatchObject({
      team_slug: 'dev',
      body: { user_login: 'nowy-dev' },
    }),
  );
  expect(await screen.findByText('Standard zatwierdzony')).toBeInTheDocument();
});
