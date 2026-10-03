import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { graphFixture } from '@/api/fixtures/graph';
import { GraphPage } from '@/pages/GraphPage';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';

/**
 * jsdom nie implementuje `ResizeObserver`, a `@xyflow/react` mierzy nim kontener grafu
 * (bez niego graf się nie renderuje — biblioteka tylko się wtedy nie mierzy).
 * Polyfill trzymamy lokalnie, żeby nie zmieniać współdzielonego `test/setup.ts` (zadanie 5.1).
 */
beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

it('renders nodes and edges from the API payload', async () => {
  renderWithProviders(<GraphPage />);

  expect(screen.getByRole('heading', { name: 'Graf' })).toBeInTheDocument();
  expect(await screen.findByTestId('graph-nodes')).toHaveTextContent('12');
  expect(screen.getByTestId('graph-edges')).toHaveTextContent('9');
  expect(await screen.findByText('core-api')).toBeInTheDocument();
});

it('filters the visible nodes by team', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  await user.selectOptions(await screen.findByLabelText('Zespół'), 'QA');

  expect(screen.getByTestId('graph-nodes')).toHaveTextContent('5');
  expect(screen.getByTestId('graph-edges')).toHaveTextContent('0');
});

it('removes repositories without elevated risk when the risk filter is on', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('core-api')).toBeInTheDocument();

  await user.click(screen.getByLabelText('Tylko podwyższone ryzyko'));

  expect(screen.queryByText('core-api')).not.toBeInTheDocument();
  expect(screen.getByTestId('graph-nodes')).toHaveTextContent('6');
  expect(screen.getByTestId('graph-edges')).toHaveTextContent('4');
});

it('renders the empty state when the API returns an empty graph', async () => {
  server.use(http.get('/api/v1/graph', () => HttpResponse.json({ nodes: [], edges: [] })));
  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('Brak danych do wyświetlenia')).toBeInTheDocument();
});

it('shows a destructive alert and refetches the graph from the error state', async () => {
  const user = userEvent.setup();
  let failing: boolean = true;

  server.use(
    http.get('/api/v1/graph', () =>
      failing
        ? HttpResponse.json({ detail: 'Graph unavailable' }, { status: 500 })
        : HttpResponse.json(graphFixture),
    ),
  );

  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('Nie udało się pobrać grafu')).toBeInTheDocument();

  failing = false;
  await user.click(screen.getByRole('button', { name: 'Odśwież' }));

  expect(await screen.findByTestId('graph-nodes')).toHaveTextContent('12');
});
