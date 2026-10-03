import { screen, within } from '@testing-library/react';

import { MocksPage } from '@/pages/MocksPage';
import { renderWithProviders } from '@/test/renderWithProviders';

it('groups the demo controls and both mocked systems into separate sections', async () => {
  renderWithProviders(<MocksPage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Mocki' })).toBeInTheDocument();
  const clock = screen.getByRole('region', { name: 'Czas symulowany' });
  expect(await within(clock).findByText(/3 października 2026/)).toBeInTheDocument();
  expect(within(clock).getByRole('button', { name: 'Reset' })).toBeInTheDocument();

  const github = screen.getByRole('region', { name: 'GitHub' });
  expect(within(github).getByText('/api/v3')).toBeInTheDocument();
  expect(within(github).getByText('Dostęp do repozytoriów')).toBeInTheDocument();

  const jira = screen.getByRole('region', { name: 'Jira' });
  expect(within(jira).getByText('/rest/api/3')).toBeInTheDocument();
  expect(within(jira).getByText('Role projektowe')).toBeInTheDocument();
});

it('links each mocked system to its own Swagger page', () => {
  renderWithProviders(<MocksPage />);

  const github = screen.getByRole('region', { name: 'GitHub' });
  expect(within(github).getByRole('link', { name: /Swagger/ })).toHaveAttribute(
    'href',
    '/mocks/github/docs',
  );
  const jira = screen.getByRole('region', { name: 'Jira' });
  expect(within(jira).getByRole('link', { name: /Swagger/ })).toHaveAttribute(
    'href',
    '/mocks/jira/docs',
  );
});
