import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, type HttpHandler, HttpResponse } from 'msw';

import { buildLeaseGraph } from '@/api/graph';
import { GraphPage } from '@/pages/GraphPage';
import { server } from '@/test/msw/server';
import { getLeases } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { GraphEdge, GraphNode, LeaseStatus, PermissionGraph } from '@/types/api';

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

/**
 * Zespół, po którym filtrujemy. W trybie live graf nie ma węzłów `team` — lista dostępów nie
 * niesie składu zespołów (patrz `api/graph.ts`) — więc opcje filtra to slugi z `user.team`.
 */
const TEAM = 'qa';

/**
 * Oczekiwany graf: ten sam builder, którym `fetchGraph()` składa węzły z `GET /api/v1/leases`
 * (MSW oddaje dokładnie ten stan dostępów, który widzi widok).
 */
function liveGraph(): PermissionGraph {
  return buildLeaseGraph(getLeases());
}

/** Trasa, której backend jeszcze nie ma (4.6B): wołanie jej to regres, nie powód do fallbacku. */
function forbidRoute(path: string, calls: string[]): HttpHandler {
  return http.get(path, () => {
    calls.push(path);
    return HttpResponse.json({ detail: `${path} not found` }, { status: 404 });
  });
}

/** Liczniki grafu to jedyna treść tych elementów, więc porównujemy je co do znaku (nie po fragmencie). */
function expectCounter(testId: string, value: number): void {
  expect(screen.getByTestId(testId).textContent).toBe(String(value));
}

function nodesOfType(graph: PermissionGraph, type: GraphNode['type']): GraphNode[] {
  return graph.nodes.filter((node: GraphNode): boolean => node.type === type);
}

function userNodesInTeam(graph: PermissionGraph, team: string): GraphNode[] {
  return nodesOfType(graph, 'user').filter((node: GraphNode): boolean => node.data.team === team);
}

/** Krawędzie dostępów wychodzące z podanych osób — filtr zespołu zostawia dokładnie je. */
function leaseEdgesOfUsers(graph: PermissionGraph, users: GraphNode[]): GraphEdge[] {
  const userIds = new Set<string>(users.map((node: GraphNode): string => node.id));

  return graph.edges.filter(
    (edge: GraphEdge): boolean => edge.data.kind === 'lease' && userIds.has(edge.source),
  );
}

/** Repozytoria, do których zespół ma dostępy — filtr zespołu zostawia je razem z osobami. */
function reposOfUsers(graph: PermissionGraph, users: GraphNode[]): string[] {
  return [
    ...new Set<string>(
      leaseEdgesOfUsers(graph, users).map((edge: GraphEdge): string => edge.target),
    ),
  ];
}

/** Krawędzie o statusie podwyższonego ryzyka — po nich filtruje przełącznik w widoku. */
function riskEdges(graph: PermissionGraph): GraphEdge[] {
  return graph.edges.filter(
    (edge: GraphEdge): boolean =>
      edge.data.status !== null && RISK_STATUSES.includes(edge.data.status),
  );
}

it('renders nodes and edges derived from the lease list', async () => {
  const graph: PermissionGraph = liveGraph();
  renderWithProviders(<GraphPage />);

  expect(screen.getByRole('heading', { name: 'Graf' })).toBeInTheDocument();
  await screen.findByTestId('graph-nodes');
  expectCounter('graph-nodes', graph.nodes.length);
  expectCounter('graph-edges', graph.edges.length);
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

  const graph: PermissionGraph = liveGraph();
  const teamUsers = userNodesInTeam(graph, TEAM);
  const teamRepos = reposOfUsers(graph, teamUsers);
  const teamEdges = leaseEdgesOfUsers(graph, teamUsers);

  await user.selectOptions(await screen.findByLabelText('Zespół'), TEAM);

  // Zespół: jego osoby i repozytoria z ich dostępów; krawędzie to same dostępy tych osób
  // (krawędzi członkostwa nie ma, bo graf nie ma węzłów zespołów).
  expect(teamUsers.length).toBeGreaterThan(0);
  expectCounter('graph-nodes', teamUsers.length + teamRepos.length);
  expectCounter('graph-edges', teamEdges.length);
});

it('removes repositories without elevated risk when the risk filter is on', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('core-api')).toBeInTheDocument();

  const risky = riskEdges(liveGraph());
  const riskyNodeIds = new Set<string>(
    risky.flatMap((edge: GraphEdge): string[] => [edge.source, edge.target]),
  );

  await user.click(screen.getByLabelText('Tylko podwyższone ryzyko'));

  expect(screen.queryByText('core-api')).not.toBeInTheDocument();
  expectCounter('graph-nodes', riskyNodeIds.size);
  expectCounter('graph-edges', risky.length);
});

it('renders the empty state and an intact team filter when there are no leases', async () => {
  server.use(http.get('/api/v1/leases', () => HttpResponse.json([])));
  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('Brak danych do wyświetlenia')).toBeInTheDocument();

  // Brak zespołów nie wywraca filtra: zostaje sama opcja „Wszystkie”.
  const select: HTMLSelectElement = (await screen.findByLabelText('Zespół')) as HTMLSelectElement;
  expect(Array.from(select.options, (option: HTMLOptionElement): string => option.value)).toEqual([
    '',
  ]);
});

it('shows a destructive alert and refetches the graph from the error state', async () => {
  const user = userEvent.setup();
  let failing: boolean = true;

  server.use(
    http.get('/api/v1/leases', () =>
      failing
        ? HttpResponse.json({ detail: 'Leases unavailable' }, { status: 500 })
        : HttpResponse.json(getLeases()),
    ),
  );

  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('Nie udało się pobrać grafu')).toBeInTheDocument();

  failing = false;
  await user.click(screen.getByRole('button', { name: 'Odśwież' }));

  await screen.findByTestId('graph-nodes');
  expectCounter('graph-nodes', liveGraph().nodes.length);
});

it('derives the graph from the lease list without calling the missing /api/v1/graph', async () => {
  const calls: string[] = [];
  server.use(forbidRoute('/api/v1/graph', calls), forbidRoute('/api/v1/dashboard', calls));

  const graph: PermissionGraph = liveGraph();
  renderWithProviders(<GraphPage />);

  await screen.findByTestId('graph-nodes');
  expectCounter('graph-nodes', graph.nodes.length);
  expectCounter('graph-edges', graph.edges.length);
  expect(await screen.findByText('core-api')).toBeInTheDocument();
  expect(calls).toEqual([]);

  // Węzłów zespołów nie ma, więc filtr oferuje slugi z `user.team` (posortowane po polsku).
  const select: HTMLSelectElement = (await screen.findByLabelText('Zespół')) as HTMLSelectElement;
  const options: string[] = Array.from(
    select.options,
    (option: HTMLOptionElement): string => option.value,
  );

  expect(options).toEqual(['', 'dev', 'qa']);
  expect(within(select).queryByRole('option', { name: 'DEV' })).not.toBeInTheDocument();
});
