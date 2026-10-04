import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, type HttpHandler, HttpResponse } from 'msw';

import { buildGraphFixture } from '@/api/fixtures/graph';
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

/** Nazwa zespołu w filtrze (etykieta węzła `team`) i slug, którym mówi zapytanie `?team=`. */
const TEAM_LABEL = 'QA';
const TEAM_SLUG = 'qa';

/**
 * Oczekiwany graf: ten sam ładunek, który oddaje handler MSW (`GET /api/v1/graph`) — węzły
 * zespołów, osób i repozytoriów plus krawędzie `membership`/`lease`.
 */
function liveGraph(team: string | null = null): PermissionGraph {
  return buildGraphFixture(getLeases(), team);
}

/** Trasa spoza grafu: wołanie jej to regres do składania węzłów z listy dostępów. */
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

/** Krawędzie o statusie podwyższonego ryzyka — po nich filtruje przełącznik w widoku. */
function riskEdges(graph: PermissionGraph): GraphEdge[] {
  return graph.edges.filter(
    (edge: GraphEdge): boolean =>
      edge.data.status !== null && RISK_STATUSES.includes(edge.data.status),
  );
}

function teamOptions(): string[] {
  const select: HTMLSelectElement = screen.getByLabelText('Zespół') as HTMLSelectElement;

  return Array.from(select.options, (option: HTMLOptionElement): string => option.value);
}

it('renderuje graf z GET /api/v1/graph razem z węzłami zespołów', async () => {
  const graph: PermissionGraph = liveGraph();
  renderWithProviders(<GraphPage />);

  expect(screen.getByRole('heading', { name: 'Mapa Dostępów' })).toBeInTheDocument();
  await screen.findByTestId('graph-nodes');
  expectCounter('graph-nodes', graph.nodes.length);
  expectCounter('graph-edges', graph.edges.length);
  expect(await screen.findByText('core-api')).toBeInTheDocument();

  // Węzły zespołów pochodzą z ładunku API (lista dostępów ich nie niesie), więc widać ich nazwy.
  expect(nodesOfType(graph, 'team')).toHaveLength(2);
  expect(screen.getAllByText('DEV').length).toBeGreaterThan(0);
  expect(screen.getAllByText(TEAM_LABEL).length).toBeGreaterThan(0);
});

it('shows the seeded organisation instead of the invented stand-ins', async () => {
  renderWithProviders(<GraphPage />);

  // Repozytoria i osoby pochodzą ze wspólnych fixture'ów (seed backendu).
  expect(await screen.findByText('payment-service')).toBeInTheDocument();
  expect(screen.getByText('kamil')).toBeInTheDocument();
  expect(screen.queryByText('payment-gw')).not.toBeInTheDocument();
  expect(screen.queryByText('anna-qa')).not.toBeInTheDocument();
});

it('zawęża graf po stronie backendu przez ?team=<slug> i nie gubi listy zespołów', async () => {
  const user = userEvent.setup();
  const searches: string[] = [];
  server.use(
    http.get('/api/v1/graph', ({ request }) => {
      const url = new URL(request.url);
      searches.push(url.search);
      return HttpResponse.json(liveGraph(url.searchParams.get('team')));
    }),
  );

  renderWithProviders(<GraphPage />);
  await screen.findByTestId('graph-nodes');
  await user.selectOptions(await screen.findByLabelText('Zespół'), TEAM_LABEL);

  // Zawężenie robi backend: widok pokazuje dokładnie ten ładunek, o który poprosił.
  const narrowed: PermissionGraph = liveGraph(TEAM_SLUG);
  await waitFor(() => {
    expectCounter('graph-nodes', narrowed.nodes.length);
  });
  expectCounter('graph-edges', narrowed.edges.length);
  expect(searches).toContain(`?team=${TEAM_SLUG}`);
  expect(nodesOfType(narrowed, 'team')).toHaveLength(1);
  expect(
    narrowed.edges.filter((edge: GraphEdge): boolean => edge.data.kind === 'membership').length,
  ).toBeGreaterThan(0);

  // Lista zespołów nie zawęża się do bieżącego wyboru — inaczej nie da się przełączyć zespołu.
  await screen.findByLabelText('Zespół');
  expect(teamOptions()).toEqual(['', 'DEV', TEAM_LABEL]);
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

it('pokazuje pusty stan i nietknięty filtr zespołu, gdy graf jest pusty', async () => {
  server.use(http.get('/api/v1/graph', () => HttpResponse.json({ nodes: [], edges: [] })));
  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('Brak danych do wyświetlenia')).toBeInTheDocument();

  // Brak zespołów nie wywraca filtra: zostaje sama opcja „Wszystkie”.
  await screen.findByLabelText('Zespół');
  expect(teamOptions()).toEqual(['']);
});

it('shows a destructive alert and refetches the graph from the error state', async () => {
  const user = userEvent.setup();
  let failing: boolean = true;

  server.use(
    http.get('/api/v1/graph', () =>
      failing
        ? HttpResponse.json({ detail: 'Graph unavailable' }, { status: 500 })
        : HttpResponse.json(liveGraph()),
    ),
  );

  renderWithProviders(<GraphPage />);

  expect(await screen.findByText('Nie udało się pobrać grafu')).toBeInTheDocument();

  failing = false;
  await user.click(screen.getByRole('button', { name: 'Odśwież' }));

  await screen.findByTestId('graph-nodes');
  expectCounter('graph-nodes', liveGraph().nodes.length);
});

it('nie składa grafu z listy dostępów, gdy GET /api/v1/graph zawodzi', async () => {
  const calls: string[] = [];
  server.use(
    http.get('/api/v1/graph', () => HttpResponse.json({ detail: 'Not Found' }, { status: 404 })),
    forbidRoute('/api/v1/leases', calls),
  );

  renderWithProviders(<GraphPage />);

  // Brak endpointu jest błędem widoku, a nie powodem do cichego fallbacku na listę dostępów.
  expect(await screen.findByText('Nie udało się pobrać grafu')).toBeInTheDocument();
  expect(screen.queryByTestId('graph-nodes')).not.toBeInTheDocument();
  expect(calls).toEqual([]);
});

it('pokazuje zespoły w filtrach jako nazwy z węzłów, nie slugi', async () => {
  renderWithProviders(<GraphPage />);

  await screen.findByTestId('graph-nodes');

  expect(teamOptions()).toEqual(['', 'DEV', TEAM_LABEL]);
  const select: HTMLSelectElement = screen.getByLabelText('Zespół') as HTMLSelectElement;
  expect(within(select).queryByRole('option', { name: TEAM_SLUG })).not.toBeInTheDocument();
});
