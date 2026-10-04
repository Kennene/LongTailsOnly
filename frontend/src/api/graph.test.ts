import { http, type HttpHandler, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/client';
import { buildGraphFixture, graphFixture } from '@/api/fixtures/graph';
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
 * Warstwa danych grafu: backend serwuje `GET /api/v1/graph` (kontraktowy `PermissionGraph`, ADR 0009)
 * z filtrem `?team=<slug>` (`app/api/v1/graph.py`), więc `fetchGraph()` nie składa już grafu
 * z listy dostępów — bierze gotowy ładunek, razem z węzłami zespołów i krawędziami członkostwa.
 *
 * Testujemy tutaj, bo widok pokazuje wyłącznie liczniki węzłów i krawędzi — identyfikatory,
 * `data` krawędzi i `position` węzłów nigdzie nie trafiają, a to one pinują kontrakt React Flow.
 */

const RISK_STATUSES: readonly LeaseStatus[] = ['WARNING', 'EXPIRED'];

/** Trasa spoza `fetchGraph`: wołanie jej to regres do składania grafu po stronie frontendu. */
function forbidRoute(path: string, calls: string[]): HttpHandler {
  return http.get(path, () => {
    calls.push(path);
    return HttpResponse.json({ detail: `${path} not found` }, { status: 404 });
  });
}

/** Ładunek, który oddaje „backend”: ta sama reguła co `insights_service.get_permission_graph`. */
function liveGraph(team: string | null = null): PermissionGraph {
  return buildGraphFixture(getLeases(), team);
}

/** Dostępy, które widzi API — graf pomija nieaktywne (odebrany dostęp), tak jak backend. */
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
  it('czyta graf z GET /api/v1/graph i nie schodzi na listę dostępów', async () => {
    const paths: string[] = [];
    const derivedPaths: string[] = [];
    const payload: PermissionGraph = {
      nodes: [
        {
          id: 'team:dev',
          type: 'team',
          position: { x: 0, y: 0 },
          data: { label: 'DEV', team: 'dev', is_admin: false },
        },
      ],
      edges: [],
    };
    server.use(
      http.get('/api/v1/graph', ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return HttpResponse.json(payload);
      }),
      forbidRoute('/api/v1/leases', derivedPaths),
      forbidRoute('/api/v1/dashboard/stats', derivedPaths),
    );

    const graph: PermissionGraph = await fetchGraph();

    expect(paths).toEqual(['/api/v1/graph']);
    expect(derivedPaths).toEqual([]);
    // Odpowiedź idzie na ekran co do znaku — frontend nie dokłada węzłów ani nie zmienia pozycji.
    expect(graph).toEqual(payload);
  });

  it('przekazuje filtr zespołu jako parametr ?team=<slug>', async () => {
    const searches: string[] = [];
    server.use(
      http.get('/api/v1/graph', ({ request }) => {
        const url = new URL(request.url);
        searches.push(url.search);
        return HttpResponse.json(liveGraph(url.searchParams.get('team')));
      }),
    );

    const whole: PermissionGraph = await fetchGraph();
    const narrowed: PermissionGraph = await fetchGraph({ team: 'qa' });

    expect(searches).toEqual(['', '?team=qa']);
    // Bez filtra ładunek niesie wszystkie zespoły, z filtrem tylko wskazany.
    expect(nodeIds(whole, 'team')).toEqual(['team:dev', 'team:qa']);
    expect(nodeIds(narrowed, 'team')).toEqual(['team:qa']);
    expect(narrowed.nodes.length).toBeLessThan(whole.nodes.length);
  });

  it('niesie węzły zespołów i krawędzie członkostwa, których lista dostępów nie ma', async () => {
    const graph: PermissionGraph = await fetchGraph();

    expect(nodeIds(graph, 'team')).toEqual(['team:dev', 'team:qa']);
    expect(
      graph.edges
        .filter((edge: GraphEdge): boolean => edge.data.kind === 'membership')
        .map((edge: GraphEdge): string => edge.id),
    ).toContain('member:kamil');
    expect(
      graph.edges
        .filter((edge: GraphEdge): boolean => edge.data.kind === 'membership')
        .every((edge: GraphEdge): boolean => edge.animated === false),
    ).toBe(true);
  });

  it('niesie rolę, status i rekomendację dostępu oraz zapala animated tylko dla ryzyka', async () => {
    const leases: LeaseOverview[] = activeLeases();
    const graph: PermissionGraph = await fetchGraph();

    leases.forEach((lease: LeaseOverview): void => {
      const edge: GraphEdge | undefined = graph.edges.find(
        (candidate: GraphEdge): boolean => candidate.id === `lease:${lease.id}`,
      );

      expect(edge).toMatchObject({
        source: `user:${lease.user.login}`,
        target: `repo:${lease.repository.name}`,
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

  it('ma pozycję w każdym węźle — kontrakt React Flow nie czeka na układ widoku', async () => {
    const graph: PermissionGraph = await fetchGraph();

    graph.nodes.forEach((node: GraphNode): void => {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    });
    expect(new Set(graph.nodes.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(
      graph.nodes.length,
    );
  });

  it('po podróży w czasie przenosi nowe statusy na krawędzie', async () => {
    advanceSimulatedClock(25);

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

  it('zwraca 404 z serwera jako błąd, a nie cichy fallback na graf z listy dostępów', async () => {
    const derivedPaths: string[] = [];
    server.use(
      http.get('/api/v1/graph', () => HttpResponse.json({ detail: 'Not Found' }, { status: 404 })),
      forbidRoute('/api/v1/leases', derivedPaths),
    );

    const error: unknown = await fetchGraph().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
    expect(derivedPaths).toEqual([]);
  });

  it('w trybie VITE_USE_FIXTURES oddaje graf z fixture i nie pyta API', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');
    const calls: string[] = [];
    server.use(forbidRoute('/api/v1/graph', calls), forbidRoute('/api/v1/leases', calls));

    expect(await fetchGraph()).toEqual(graphFixture);
    expect(calls).toEqual([]);
  });
});
