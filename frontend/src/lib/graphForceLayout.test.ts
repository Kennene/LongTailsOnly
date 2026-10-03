import type { XYPosition } from '@xyflow/react';

import { graphFixture } from '@/api/fixtures/graph';
import { leasesFixture } from '@/api/fixtures/leases';
import { buildLeaseGraph } from '@/api/graph';
import {
  computeForceLayout,
  GRAPH_NODE_RADIUS,
  type LayoutPositions,
} from '@/lib/graphForceLayout';
import type { GraphNode, PermissionGraph } from '@/types/api';

/** Graf z trybu live: bez węzłów zespołów i bez krawędzi `membership` (patrz `api/graph.ts`). */
const LIVE_GRAPH: PermissionGraph = buildLeaseGraph(leasesFixture);

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
  ['live (bez zespołów)', LIVE_GRAPH],
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
