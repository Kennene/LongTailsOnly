import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { buildGraphFixture } from '@/api/fixtures/graph';
import { getStatusBadge } from '@/lib/statusBadges';
import { GraphPage } from '@/pages/GraphPage';
import { getLeases } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { GraphEdge, PermissionGraph } from '@/types/api';

/** `@xyflow/react` mierzy kontener `ResizeObserver`em, którego jsdom nie ma (jak w `GraphPage.test`). */
beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

/** Graf, który widzi widok — ten sam builder, którym MSW odpowiada na `GET /api/v1/graph`. */
function liveGraph(): PermissionGraph {
  return buildGraphFixture(getLeases());
}

/** Wszystkie krawędzie węzła — dostępy i, od `GET /api/v1/graph`, członkostwo w zespole. */
function edgesTouching(nodeId: string): GraphEdge[] {
  return liveGraph().edges.filter(
    (edge: GraphEdge): boolean => edge.source === nodeId || edge.target === nodeId,
  );
}

function nodeIdOf(label: string): string {
  const match = liveGraph().nodes.find((node): boolean => node.data.label === label);

  if (match === undefined) {
    throw new Error(`Brak węzła ${label} w grafie live`);
  }

  return match.id;
}

/** Węzeł zaznaczony + drugi koniec każdego jego dostępu. */
function expectedHighlight(label: string): number {
  return 1 + edgesTouching(nodeIdOf(label)).length;
}

function highlighted(): string | null {
  return screen.getByTestId('graph-highlighted').textContent;
}

/**
 * Węzeł grafu to przycisk z `aria-label` („kamil — dostępy: 10, …”). React Flow ukrywa
 * (`visibility: hidden`) węzły, których jsdom nie zmierzy, a ukryty element ma pustą nazwę
 * dostępną — dlatego szukamy po `aria-label`, nie po roli z nazwą.
 */
async function findNodeButton(label: string): Promise<HTMLElement> {
  return screen.findByLabelText(new RegExp(`^${label} —`), { selector: 'button' });
}

/**
 * Klik w węzeł bez gestu wskaźnika: `user.click` wysyła `mousedown` bez `view`, a `d3-drag`
 * (przeciąganie węzłów) czyta w jsdom `event.view.document` i rzuca. Testujemy klik w przycisk.
 */
async function clickNode(label: string): Promise<void> {
  fireEvent.click(await findNodeButton(label));
}

it('highlights a person with their repositories after a click, and Escape clears it', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  await clickNode('kamil');

  expect(highlighted()).toBe(String(expectedHighlight('kamil')));
  expect(expectedHighlight('kamil')).toBeGreaterThan(1);

  await user.keyboard('{Escape}');

  expect(highlighted()).toBe('0');
});

it('selects a node from the keyboard with Enter', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  const node: HTMLElement = await findNodeButton('kamil');
  node.focus();
  await user.keyboard('{Enter}');

  expect(highlighted()).toBe(String(expectedHighlight('kamil')));
  expect(node).toHaveAttribute('aria-pressed', 'true');
});

it('highlights everyone with access to a repository after clicking it', async () => {
  renderWithProviders(<GraphPage />);

  await clickNode('payment-service');

  expect(highlighted()).toBe(String(expectedHighlight('payment-service')));
});

it('selects a person picked from the list above the graph', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />);

  await user.type(await screen.findByRole('combobox', { name: 'Osoba' }), 'kamil');

  expect(highlighted()).toBe(String(expectedHighlight('kamil')));
});

it('restores the selection from the URL and lists the access in the details panel', async () => {
  renderWithProviders(<GraphPage />, { route: '/graph?user=kamil' });

  const panel: HTMLElement = await screen.findByRole('region', { name: 'Szczegóły: kamil' });
  // Panel wylicza dostępy (repo), więc krawędź członkostwa zespół → osoba nie wchodzi do licznika.
  const leases: GraphEdge[] = edgesTouching(nodeIdOf('kamil')).filter(
    (edge: GraphEdge): boolean => edge.data.kind === 'lease',
  );
  const risky: number = leases.filter(
    (edge: GraphEdge): boolean => edge.data.status === 'WARNING' || edge.data.status === 'EXPIRED',
  ).length;

  expect(highlighted()).toBe(String(expectedHighlight('kamil')));
  expect(
    within(panel).getByText(new RegExp(`^${leases.length} repo, w tym ${risky} `)),
  ).toBeInTheDocument();
  expect(within(panel).getAllByRole('listitem')).toHaveLength(leases.length);
  // Najwyższe ryzyko na górze: pierwszy wiersz to dostęp wygasły.
  expect(
    within(within(panel).getAllByRole('listitem')[0]).getByText(getStatusBadge('EXPIRED').label),
  ).toBeInTheDocument();
});

it('shows no highlight and explains how to clear a selection when nothing is selected', async () => {
  renderWithProviders(<GraphPage />);

  await screen.findByTestId('graph-nodes');

  // Podpowiedź siedzi w opisie widoku, a nie nad płótnem — nie zasłania węzłów.
  expect(highlighted()).toBe('0');
  expect(screen.getByText(/Escape albo kliknięcie w tło czyści zaznaczenie/)).toBeInTheDocument();
});

it('shows the details panel only once a node is selected', async () => {
  renderWithProviders(<GraphPage />);

  await screen.findByTestId('graph-nodes');

  expect(screen.queryByRole('region', { name: /^Szczegóły:/ })).not.toBeInTheDocument();

  await clickNode('kamil');

  expect(screen.getByRole('region', { name: 'Szczegóły: kamil' })).toBeInTheDocument();
});

it('closes the details panel with its close button and clears the selection', async () => {
  const user = userEvent.setup();
  renderWithProviders(<GraphPage />, { route: '/graph?user=kamil' });

  const panel: HTMLElement = await screen.findByRole('region', { name: 'Szczegóły: kamil' });
  await user.click(within(panel).getByRole('button', { name: 'Zamknij szczegóły' }));

  expect(screen.queryByRole('region', { name: /^Szczegóły:/ })).not.toBeInTheDocument();
  expect(highlighted()).toBe('0');
});
