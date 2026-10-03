import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { DashboardPage } from '@/pages/DashboardPage';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';

const KPI_LABELS: string[] = [
  'Aktywne dzierżawy',
  'Ostrzeżenia',
  'Wygaśnięte',
  'Rekomendacje deeskalacji',
];

const ZERO_COUNTERS = { active: 0, warning: 0, expired: 0, downscope_recommendations: 0 };

describe('DashboardPage', () => {
  it('renders the four KPI counters from the API', async () => {
    renderWithProviders(<DashboardPage />);

    for (const label of KPI_LABELS) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }

    expect(screen.getByTestId('kpi-active')).toHaveTextContent('12');
    expect(screen.getByTestId('kpi-warning')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-expired')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-downscope')).toHaveTextContent('1');
  });

  it('renders zeros when the API returns empty counters', async () => {
    server.use(http.get('/api/v1/dashboard', () => HttpResponse.json(ZERO_COUNTERS)));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByTestId('kpi-warning')).toHaveTextContent('0');
    expect(screen.getByTestId('kpi-active')).toHaveTextContent('0');
    expect(screen.getByTestId('kpi-expired')).toHaveTextContent('0');
    expect(screen.getByTestId('kpi-downscope')).toHaveTextContent('0');
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

    expect(await screen.findByTestId('kpi-active')).toHaveTextContent('12');
  });

  it('replaces the counters with a skeleton while they are loading', async () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getAllByTestId('kpi-skeleton')).toHaveLength(4);

    await screen.findByTestId('kpi-active');

    expect(screen.queryAllByTestId('kpi-skeleton')).toHaveLength(0);
  });
});
