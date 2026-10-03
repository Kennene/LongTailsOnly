import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { graphFixture } from '@/api/fixtures/graph';
import { GraphPage } from '@/pages/GraphPage';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { GraphEdge, GraphNode, LeaseStatus } from '@/types/api';

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

const RISK_STATUSES: readonly LeaseStatus[] = ['WARNING', 'EXPIRED'];
const TEAM = 'QA';

function nodesOfType(type: GraphNode['type']): GraphNode[] {
  return graphFixture.nodes.filter((node: GraphNode): boolean => node.type === type);
}

function userNodesInTeam(team: string): GraphNode[] {
  return nodesOfType('user').filter((node: GraphNode): boolean => node.data.team === team);
}

/** Repozytoria, do których zespół ma dzierżawy — filtr zespołu zostawia je razem z osobami. */
function reposOfUsers(users: GraphNode[]): string[] {
  const userIds = new Set<string>(users.map((node: GraphNode): string => node.id));

  return [
    ...new Set<string>(
      graphFixture.edges
        .filter(
          (edge: GraphEdge): boolean => edge.data.kind === 'lease' && userIds.has(edge.source),
        )
        .map((edge: GraphEdge): string => edge.target),
    ),
  ];
}

/** Krawędzie o statusie podwyższonego ryzyka — po nich filtruje przełącznik w widoku. */
function riskEdges(): GraphEdge[] {
  return graphFixture.edges.filter(
    (edge: GraphEdge): boolean =>
      edge.data.status !== null && RISK_STATUSES.includes(edge.data.status),
  );
}

it('renders nodes and edges from the API payload', async () => {
  renderWithProviders(<GraphPage />);

  expect(screen.getByRole('heading', { name: 'Graf' })).toBeInTheDocument();
  expect(await screen.findByTestId('graph-nodes')).toHaveTextContent(
    String(graphFixture.nodes.length),
  );
  expect(screen.getByTestId('graph-edges')).toHaveTextContent(String(graphFixture.edges.length));
  expect(await screen.findByText('core-api')).toBeInTheDocument();
});

it('shows the seeded organisation instead of the invented stand-ins', async () => {
  renderWithProviders(<GraphPage />);

  // Repozytoria i osoby pochodzą ze wspólnych fixture'ów (seed backendu).
  expect(await screen.findByText('payment-service')).toBeInTheDocument();
  expect(screen.getByText('kamil')).toBeInTheDocument();
  expect(screen.queryByText('payment-gw')).not.toBeInTheDocument();
  expect(screen.queryByText('anna-qa')).not.toBeInTheDocument();
});

it('filters the visible nodes by team', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  const teamUsers = userNodesInTeam('qa');
  const teamRepos = reposOfUsers(teamUsers);

  await user.selectOptions(await screen.findByLabelText('Zespół'), TEAM);

  // Zespół: węzeł zespołu + jego osoby + repozytoria z ich dzierżaw; krawędzie to
  // członkostwa tych osób i ich dzierżawy.
  expect(screen.getByTestId('graph-nodes')).toHaveTextContent(
    String(1 + teamUsers.length + teamRepos.length),
  );
  expect(screen.getByTestId('graph-edges')).toHaveTextContent(
    String(teamUsers.length + teamRepos.length),
  );
});

it('removes repositories without elevated risk when the risk filter is on', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('core-api')).toBeInTheDocument();

  const risky = riskEdges();
  const riskyNodeIds = new Set<string>(
    risky.flatMap((edge: GraphEdge): string[] => [edge.source, edge.target]),
  );

  await user.click(screen.getByLabelText('Tylko podwyższone ryzyko'));

  expect(screen.queryByText('core-api')).not.toBeInTheDocument();
  expect(screen.getByTestId('graph-nodes')).toHaveTextContent(String(riskyNodeIds.size));
  expect(screen.getByTestId('graph-edges')).toHaveTextContent(String(risky.length));
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

  expect(await screen.findByTestId('graph-nodes')).toHaveTextContent(
    String(graphFixture.nodes.length),
  );
});
