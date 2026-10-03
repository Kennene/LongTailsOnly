import { http, type HttpHandler, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { graphFixture } from '@/api/fixtures/graph';
import { fetchGraph } from '@/api/graph';
import { server } from '@/test/msw/server';
import { advanceSimulatedClock, getLeases } from '@/test/msw/state';
import type {
  GraphEdge,
  GraphNode,
  LeaseOverview,
  LeaseStatus,
  PermissionGraph,
} from '@/types/api';

/**
 * Warstwa danych grafu: backend **nie serwuje** `GET /api/v1/graph` (krok 4.6B), więc
 * `fetchGraph()` składa `PermissionGraph` z listy dzierżaw (`GET /api/v1/leases`), odwzorowując
 * `app/domain/insights.py::build_graph_layout`.
 *
 * Testujemy tutaj, bo widok pokazuje wyłącznie liczniki węzłów i krawędzi — identyfikatory,
 * `data` krawędzi i `position` węzłów nigdzie nie trafiają, a to one pinują kontrakt React Flow.
 */

const RISK_STATUSES: readonly LeaseStatus[] = ['WARNING', 'EXPIRED'];

/** Trasa, której backend jeszcze nie ma: wołanie jej to regres, a nie powód do cichego fallbacku. */
function forbidRoute(path: string, calls: string[]): HttpHandler {
  return http.get(path, () => {
    calls.push(path);
    return HttpResponse.json({ detail: `${path} not found` }, { status: 404 });
  });
}

/** Dzierżawy, które widzi API — graf pomija nieaktywne (odebrany dostęp), tak jak backend. */
function activeLeases(): LeaseOverview[] {
  return getLeases().filter((lease: LeaseOverview): boolean => lease.is_active);
}

function uniqueIds(values: string[]): string[] {
  return [...new Set<string>(values)].toSorted();
}

function nodeIds(graph: PermissionGraph, type: GraphNode['type']): string[] {
  return uniqueIds(
    graph.nodes.filter((node: GraphNode): boolean => node.type === type).map((node) => node.id),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchGraph', () => {
  it('składa węzły osób i repozytoriów oraz krawędź na każdą czynną dzierżawę', async () => {
    const leases: LeaseOverview[] = activeLeases();
    const graph: PermissionGraph = await fetchGraph();

    expect(nodeIds(graph, 'user')).toEqual(
      uniqueIds(leases.map((lease) => `user:${lease.user.id}`)),
    );
    expect(nodeIds(graph, 'repo')).toEqual(
      uniqueIds(leases.map((lease) => `repo:${lease.repository.id}`)),
    );
    expect(graph.nodes).toHaveLength(nodeIds(graph, 'user').length + nodeIds(graph, 'repo').length);
    expect(graph.edges.map((edge: GraphEdge): string => edge.id).toSorted()).toEqual(
      uniqueIds(leases.map((lease) => `lease:${lease.id}`)),
    );
  });

  it('nie tworzy węzłów zespołów ani krawędzi członkostwa, bo lista dzierżaw nie niesie składu zespołów', async () => {
    const graph: PermissionGraph = await fetchGraph();

    expect(graph.nodes.filter((node: GraphNode): boolean => node.type === 'team')).toEqual([]);
    expect(
      graph.edges.filter((edge: GraphEdge): boolean => edge.data.kind === 'membership'),
    ).toEqual([]);
    // Zespół zostaje tam, gdzie naprawdę jest w payloadzie: na węźle osoby (slug z `user.team`).
    expect(
      new Set(
        graph.nodes
          .filter((node: GraphNode): boolean => node.type === 'user')
          .map((node) => node.data.team),
      ),
    ).toEqual(new Set(activeLeases().map((lease) => lease.user.team?.slug ?? null)));
  });

  it('niesie rolę, status i rekomendację dzierżawy oraz zapala animated tylko dla ryzyka', async () => {
    const leases: LeaseOverview[] = activeLeases();
    const graph: PermissionGraph = await fetchGraph();

    leases.forEach((lease: LeaseOverview): void => {
      const edge: GraphEdge | undefined = graph.edges.find(
        (candidate: GraphEdge): boolean => candidate.id === `lease:${lease.id}`,
      );

      expect(edge).toMatchObject({
        source: `user:${lease.user.id}`,
        target: `repo:${lease.repository.id}`,
        label: lease.current_role,
        animated: RISK_STATUSES.includes(lease.status),
        data: {
          kind: 'lease',
          role: lease.current_role,
          status: lease.status,
          recommendation: lease.recommendation,
        },
      });
    });

    // Gdyby fixture'y nie miały obu rodzajów statusów, `animated` nie byłoby czym pinować.
    expect(
      leases.some((lease: LeaseOverview): boolean => RISK_STATUSES.includes(lease.status)),
    ).toBe(true);
    expect(
      leases.some((lease: LeaseOverview): boolean => !RISK_STATUSES.includes(lease.status)),
    ).toBe(true);
  });

  it('nadaje każdemu węzłowi pozycję i trzyma układ między odczytami', async () => {
    server.use(forbidRoute('/api/v1/graph', []));

    const first: PermissionGraph = await fetchGraph();
    const second: PermissionGraph = await fetchGraph();

    first.nodes.forEach((node: GraphNode): void => {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    });
    expect(new Set(first.nodes.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(
      first.nodes.length,
    );
    expect(second.nodes).toEqual(first.nodes);
  });

  it('po podróży w czasie przenosi nowe statusy na krawędzie', async () => {
    advanceSimulatedClock(25);
    server.use(forbidRoute('/api/v1/graph', []));

    const leases: LeaseOverview[] = activeLeases();
    const graph: PermissionGraph = await fetchGraph();

    leases.forEach((lease: LeaseOverview): void => {
      const edge: GraphEdge | undefined = graph.edges.find(
        (candidate: GraphEdge): boolean => candidate.id === `lease:${lease.id}`,
      );

      expect(edge?.data.status).toBe(lease.status);
      expect(edge?.animated).toBe(RISK_STATUSES.includes(lease.status));
    });
  });

  it('nie woła brakującego GET /api/v1/graph (krok 4.6B)', async () => {
    const calls: string[] = [];
    server.use(forbidRoute('/api/v1/graph', calls));

    const graph: PermissionGraph = await fetchGraph();

    expect(calls).toEqual([]);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it('w trybie VITE_USE_FIXTURES oddaje graf z fixture i nie pyta API', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');
    const calls: string[] = [];
    server.use(forbidRoute('/api/v1/leases', calls), forbidRoute('/api/v1/graph', calls));

    expect(await fetchGraph()).toEqual(graphFixture);
    expect(calls).toEqual([]);
  });
});
