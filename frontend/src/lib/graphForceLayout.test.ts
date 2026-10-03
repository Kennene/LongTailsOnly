import type { XYPosition } from '@xyflow/react';

import { graphFixture } from '@/api/fixtures/graph';
import {
  computeForceLayout,
  fitLayoutToAspect,
  GRAPH_NODE_RADIUS,
  type LayoutPositions,
} from '@/lib/graphForceLayout';
import type { GraphEdge, GraphNode, PermissionGraph } from '@/types/api';

/**
 * Graf bez węzłów zespołów i bez krawędzi `membership` — rzadszy przypadek brzegowy dla układu.
 * Tryb live dostaje dziś gotowy graf z `GET /api/v1/graph` (z zespołami), więc budujemy go
 * z fixture'a, zamiast z usuniętej ścieżki pochodnej z listy dostępów.
 */
const GRAPH_WITHOUT_TEAMS: PermissionGraph = {
  nodes: graphFixture.nodes.filter((node: GraphNode): boolean => node.type !== 'team'),
  edges: graphFixture.edges.filter((edge: GraphEdge): boolean => edge.data.kind !== 'membership'),
};

function layoutOf(graph: PermissionGraph): LayoutPositions {
  return computeForceLayout(graph.nodes, graph.edges);
}

/** Środek okręgu: układ zwraca lewy górny róg (tak, jak React Flow pozycjonuje węzeł). */
function centreOf(positions: LayoutPositions, node: GraphNode): XYPosition {
  const radius: number = GRAPH_NODE_RADIUS[node.type];
  const corner: XYPosition = positions[node.id];

  return { x: corner.x + radius, y: corner.y + radius };
}

/** Pary węzłów, których okręgi na siebie nachodzą — oczekujemy pustej listy. */
function overlappingPairs(graph: PermissionGraph, positions: LayoutPositions): string[] {
  const overlaps: string[] = [];

  graph.nodes.forEach((left: GraphNode, index: number): void => {
    graph.nodes.slice(index + 1).forEach((right: GraphNode): void => {
      const a: XYPosition = centreOf(positions, left);
      const b: XYPosition = centreOf(positions, right);
      const distance: number = Math.hypot(a.x - b.x, a.y - b.y);

      if (distance < GRAPH_NODE_RADIUS[left.type] + GRAPH_NODE_RADIUS[right.type]) {
        overlaps.push(`${left.id} × ${right.id}`);
      }
    });
  });

  return overlaps;
}

describe.each([
  ['fixtures (zespoły + membership)', graphFixture],
  ['bez zespołów', GRAPH_WITHOUT_TEAMS],
])('computeForceLayout — %s', (_name: string, graph: PermissionGraph) => {
  it('gives every node a finite position', () => {
    const positions: LayoutPositions = layoutOf(graph);

    graph.nodes.forEach((node: GraphNode): void => {
      expect(Number.isFinite(positions[node.id]?.x)).toBe(true);
      expect(Number.isFinite(positions[node.id]?.y)).toBe(true);
    });
  });

  it('is deterministic: two runs on equal input give identical positions', () => {
    const first: LayoutPositions = layoutOf(structuredClone(graph));
    const second: LayoutPositions = layoutOf(structuredClone(graph));

    expect(second).toEqual(first);
  });

  it('keeps node circles from overlapping', () => {
    expect(overlappingPairs(graph, layoutOf(graph))).toEqual([]);
  });
});

it('ignores the column positions delivered by the API', () => {
  const shifted: GraphNode[] = graphFixture.nodes.map((node: GraphNode): GraphNode => ({
    ...node,
    position: { x: 9999, y: -9999 },
  }));

  expect(computeForceLayout(shifted, graphFixture.edges)).toEqual(layoutOf(graphFixture));
});

it('does not depend on the order of incoming nodes', () => {
  const reversed: GraphNode[] = graphFixture.nodes.toReversed();

  expect(computeForceLayout(reversed, graphFixture.edges)).toEqual(layoutOf(graphFixture));
});

it('reuses the computed layout for the same node list instead of simulating again', () => {
  expect(layoutOf(graphFixture)).toBe(layoutOf(graphFixture));
});

it('sizes teams above people and people above repositories', () => {
  expect(GRAPH_NODE_RADIUS.team).toBeGreaterThan(GRAPH_NODE_RADIUS.user);
  expect(GRAPH_NODE_RADIUS.user).toBeGreaterThan(GRAPH_NODE_RADIUS.repo);
});

it('returns an empty layout for an empty graph', () => {
  expect(computeForceLayout([], [])).toEqual({});
});

/** Proporcje (szerokość / wysokość) prostokąta obejmującego wszystkie okręgi układu. */
function aspectOf(graph: PermissionGraph, positions: LayoutPositions): number {
  const lefts: number[] = graph.nodes.map((node: GraphNode): number => positions[node.id].x);
  const tops: number[] = graph.nodes.map((node: GraphNode): number => positions[node.id].y);
  const rights: number[] = graph.nodes.map(
    (node: GraphNode): number => positions[node.id].x + 2 * GRAPH_NODE_RADIUS[node.type],
  );
  const bottoms: number[] = graph.nodes.map(
    (node: GraphNode): number => positions[node.id].y + 2 * GRAPH_NODE_RADIUS[node.type],
  );

  return (Math.max(...rights) - Math.min(...lefts)) / (Math.max(...bottoms) - Math.min(...tops));
}

/** Odległości między środkami wszystkich par węzłów, w stałej kolejności par. */
function pairDistances(graph: PermissionGraph, positions: LayoutPositions): number[] {
  return graph.nodes.flatMap((left: GraphNode, index: number): number[] =>
    graph.nodes.slice(index + 1).map((right: GraphNode): number => {
      const a: XYPosition = centreOf(positions, left);
      const b: XYPosition = centreOf(positions, right);

      return Math.hypot(a.x - b.x, a.y - b.y);
    }),
  );
}

describe('fitLayoutToAspect', () => {
  const base: LayoutPositions = layoutOf(graphFixture);
  const baseAspect: number = aspectOf(graphFixture, base);

  it.each([
    ['a wide pane', baseAspect * 1.8],
    ['a tall pane', baseAspect / 1.6],
  ])('stretches the layout to the proportions of %s', (_name: string, target: number) => {
    const fitted: LayoutPositions = fitLayoutToAspect(graphFixture.nodes, base, target);

    expect(aspectOf(graphFixture, fitted)).toBeCloseTo(target, 1);
  });

  it('only pushes nodes apart, so circles still do not overlap', () => {
    const fitted: LayoutPositions = fitLayoutToAspect(graphFixture.nodes, base, baseAspect * 2);
    const before: number[] = pairDistances(graphFixture, base);

    expect(overlappingPairs(graphFixture, fitted)).toEqual([]);
    pairDistances(graphFixture, fitted).forEach((distance: number, index: number): void => {
      expect(distance).toBeGreaterThanOrEqual(before[index] - 1e-6);
    });
  });

  it('caps the stretch so a very wide pane does not flatten the web into a line', () => {
    const fitted: LayoutPositions = fitLayoutToAspect(graphFixture.nodes, base, baseAspect * 10);

    expect(aspectOf(graphFixture, fitted)).toBeLessThan(baseAspect * 3);
  });

  it('keeps the layout untouched without a measured pane', () => {
    expect(fitLayoutToAspect(graphFixture.nodes, base, null)).toBe(base);
  });

  it('returns an empty layout for an empty graph', () => {
    expect(fitLayoutToAspect([], {}, 2)).toEqual({});
  });
});
