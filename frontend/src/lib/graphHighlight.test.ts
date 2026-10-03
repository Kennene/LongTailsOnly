import {
  type AccessRow,
  accessRowsOf,
  type GraphHighlight,
  highlightOf,
  neighboursOf,
  nodeFromParams,
  selectionParamsOf,
} from '@/lib/graphHighlight';
import type {
  GraphEdge,
  GraphEdgeData,
  GraphNode,
  LeaseStatus,
  Recommendation,
  Role,
} from '@/types/api';

function node(id: string, type: GraphNode['type'], team: string | null = null): GraphNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { label: id.split(':')[1], team, is_admin: false },
  };
}

function lease(
  user: string,
  repo: string,
  role: Role,
  status: LeaseStatus,
  recommendation: Recommendation = 'KEEP',
): GraphEdge {
  const data: GraphEdgeData = { kind: 'lease', role, status, recommendation };

  return {
    id: `lease:${user}-${repo}`,
    source: `user:${user}`,
    target: `repo:${repo}`,
    label: role,
    animated: false,
    data,
  };
}

function membership(team: string, user: string): GraphEdge {
  const data: GraphEdgeData = {
    kind: 'membership',
    role: null,
    status: null,
    recommendation: null,
  };

  return {
    id: `member:${user}`,
    source: `team:${team}`,
    target: `user:${user}`,
    label: null,
    animated: false,
    data,
  };
}

/** Mały graf: zespół DEV (kamil, ola), osoba bez zespołu (ewa), trzy repozytoria. */
const NODES: GraphNode[] = [
  node('team:dev', 'team', 'dev'),
  node('user:kamil', 'user', 'dev'),
  node('user:ola', 'user', 'dev'),
  node('user:ewa', 'user'),
  node('repo:core-api', 'repo'),
  node('repo:payment-service', 'repo'),
  node('repo:legacy-reports', 'repo'),
];

const EDGES: GraphEdge[] = [
  membership('dev', 'kamil'),
  membership('dev', 'ola'),
  lease('kamil', 'core-api', 'write', 'ACTIVE'),
  lease('kamil', 'payment-service', 'write', 'WARNING', 'DOWNSCOPE'),
  lease('kamil', 'legacy-reports', 'write', 'EXPIRED', 'REVOKE'),
  lease('ola', 'core-api', 'read', 'ACTIVE'),
  lease('ewa', 'payment-service', 'admin', 'PERMANENT'),
];

/** Graf z trybu live: te same osoby i dostępy, ale bez zespołu i bez `membership`. */
const LIVE_NODES: GraphNode[] = NODES.filter(
  (graphNode: GraphNode): boolean => graphNode.type !== 'team',
);
const LIVE_EDGES: GraphEdge[] = EDGES.filter(
  (edge: GraphEdge): boolean => edge.data.kind === 'lease',
);

function sorted(ids: Set<string> | undefined): string[] {
  return [...(ids ?? [])].sort();
}

it('returns no highlight when nothing is selected', () => {
  expect(highlightOf(NODES, EDGES, null)).toBeNull();
});

it('returns no highlight when the selected node is not in the visible graph', () => {
  expect(highlightOf(LIVE_NODES, LIVE_EDGES, 'team:dev')).toBeNull();
});

it('highlights a person, their leases, their repositories and their team', () => {
  const highlight: GraphHighlight | null = highlightOf(NODES, EDGES, 'user:kamil');

  expect(sorted(highlight?.nodeIds)).toEqual([
    'repo:core-api',
    'repo:legacy-reports',
    'repo:payment-service',
    'team:dev',
    'user:kamil',
  ]);
  expect(sorted(highlight?.edgeIds)).toEqual([
    'lease:kamil-core-api',
    'lease:kamil-legacy-reports',
    'lease:kamil-payment-service',
    'member:kamil',
  ]);
});

it('highlights a person in a graph without team nodes', () => {
  const highlight: GraphHighlight | null = highlightOf(LIVE_NODES, LIVE_EDGES, 'user:kamil');

  expect(highlight?.nodeIds.size).toBe(4);
  expect(highlight?.edgeIds.size).toBe(3);
});

it('highlights everyone with access to a repository, but not their other leases', () => {
  const highlight: GraphHighlight | null = highlightOf(NODES, EDGES, 'repo:payment-service');

  expect(sorted(highlight?.nodeIds)).toEqual(['repo:payment-service', 'user:ewa', 'user:kamil']);
  expect(sorted(highlight?.edgeIds)).toEqual([
    'lease:ewa-payment-service',
    'lease:kamil-payment-service',
  ]);
});

it('highlights a team with its members and their access', () => {
  const highlight: GraphHighlight | null = highlightOf(NODES, EDGES, 'team:dev');

  expect(sorted(highlight?.nodeIds)).toEqual([
    'repo:core-api',
    'repo:legacy-reports',
    'repo:payment-service',
    'team:dev',
    'user:kamil',
    'user:ola',
  ]);
  expect(highlight?.edgeIds.has('lease:ewa-payment-service')).toBe(false);
  expect(highlight?.edgeIds.size).toBe(6);
});

it('lights up only direct neighbours on hover', () => {
  const hover: GraphHighlight = neighboursOf(EDGES, 'repo:core-api');

  expect(sorted(hover.nodeIds)).toEqual(['repo:core-api', 'user:kamil', 'user:ola']);
  expect(hover.edgeIds.size).toBe(2);
});

it('lists the access of a person from the highest risk down', () => {
  const rows: AccessRow[] = accessRowsOf(NODES, EDGES, 'user:kamil');

  expect(rows.map((row: AccessRow): string => row.label)).toEqual([
    'legacy-reports',
    'payment-service',
    'core-api',
  ]);
  expect(rows[0]).toMatchObject({ role: 'write', status: 'EXPIRED', recommendation: 'REVOKE' });
});

it('lists the people with access to a repository', () => {
  const rows: AccessRow[] = accessRowsOf(NODES, EDGES, 'repo:payment-service');

  expect(rows.map((row: AccessRow): string => row.label)).toEqual(['kamil', 'ewa']);
});

it('lists team members with their worst lease status', () => {
  const rows: AccessRow[] = accessRowsOf(NODES, EDGES, 'team:dev');

  expect(rows.map((row: AccessRow): string => row.label)).toEqual(['kamil', 'ola']);
  expect(rows[0]).toMatchObject({ role: null, status: 'EXPIRED', recommendation: null });
});

it('maps a selected node to a shareable URL parameter by its label', () => {
  expect(selectionParamsOf(NODES, 'user:kamil')).toEqual({ user: 'kamil' });
  expect(selectionParamsOf(NODES, 'repo:core-api')).toEqual({ repo: 'core-api' });
  expect(selectionParamsOf(NODES, null)).toEqual({});
});

it('restores the selected node from URL parameters, ignoring unknown labels', () => {
  expect(nodeFromParams(NODES, new URLSearchParams('user=kamil'))).toBe('user:kamil');
  expect(nodeFromParams(NODES, new URLSearchParams('team=dev'))).toBe('team:dev');
  expect(nodeFromParams(LIVE_NODES, new URLSearchParams('user=nobody'))).toBeNull();
  expect(nodeFromParams(NODES, new URLSearchParams(''))).toBeNull();
});
