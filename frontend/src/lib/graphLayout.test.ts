import { applyColumnLayout, type GraphNodeInput, MAX_ROWS_PER_COLUMN } from '@/lib/graphLayout';
import type { GraphNode, GraphNodeData } from '@/types/api';

type NodeType = GraphNode['type'];

function node(id: string, type: NodeType, label: string): GraphNodeInput {
  const data: GraphNodeData = { label, team: null, is_admin: false };

  return { id, type, data };
}

const THREE_TYPES: GraphNodeInput[] = [
  node('u1', 'user', 'kamil'),
  node('t1', 'team', 'DEV'),
  node('r1', 'repo', 'core-api'),
];

function xOf(nodes: GraphNode[], id: string): number {
  const graphNode = nodes.find((candidate: GraphNode): boolean => candidate.id === id);

  if (graphNode === undefined) {
    throw new Error(`Node ${id} has no position`);
  }

  return graphNode.position.x;
}

function yOf(nodes: GraphNode[], id: string): number {
  const graphNode = nodes.find((candidate: GraphNode): boolean => candidate.id === id);

  if (graphNode === undefined) {
    throw new Error(`Node ${id} has no position`);
  }

  return graphNode.position.y;
}

it('assigns deterministic columns by node type when position is missing', () => {
  const laidOut = applyColumnLayout(THREE_TYPES);

  expect(xOf(laidOut, 'u1')).toBeLessThan(xOf(laidOut, 't1'));
  expect(xOf(laidOut, 't1')).toBeLessThan(xOf(laidOut, 'r1'));
});

it('keeps rows in the order of appearance within a column', () => {
  const laidOut = applyColumnLayout([node('u1', 'user', 'ania'), node('u2', 'user', 'bartek')]);

  expect(xOf(laidOut, 'u1')).toBe(xOf(laidOut, 'u2'));
  expect(yOf(laidOut, 'u1')).toBeLessThan(yOf(laidOut, 'u2'));
});

it('starts every column at the top instead of stacking all nodes in one column', () => {
  const laidOut = applyColumnLayout([
    node('u1', 'user', 'ania'),
    node('u2', 'user', 'bartek'),
    node('u3', 'user', 'celina'),
    node('r1', 'repo', 'core-api'),
    node('r2', 'repo', 'payment-service'),
  ]);

  expect(yOf(laidOut, 'u1')).toBe(0);
  expect(yOf(laidOut, 'r1')).toBe(0);
  expect(yOf(laidOut, 'r2')).toBe(yOf(laidOut, 'u2'));
});

it('is idempotent for nodes that already carry a position', () => {
  const laidOut = applyColumnLayout(THREE_TYPES);

  expect(applyColumnLayout(laidOut)).toEqual(laidOut);
});

it('does not overwrite a position delivered by the API', () => {
  const positioned: GraphNodeInput[] = [
    { ...node('u1', 'user', 'ania'), position: { x: 42, y: 7 } },
  ];

  expect(applyColumnLayout(positioned)[0].position).toEqual({ x: 42, y: 7 });
});

it('returns contract-shaped nodes, so a payload without positions can still render', () => {
  const laidOut: GraphNode[] = applyColumnLayout(THREE_TYPES);

  expect(laidOut.map((graphNode: GraphNode): NodeType => graphNode.type)).toEqual([
    'user',
    'team',
    'repo',
  ]);
});

/**
 * Dane demo mają 19 osób i 10 repozytoriów. Jeden stos 19 kart ma ~1400 px wysokości, więc
 * `fitView` nie mieścił go w panelu i węzły wychodziły poza ramkę (defekt z audytu) — kolumna
 * musi pękać na sub-kolumny. Ten test pada na starym układzie (jedna kolumna na typ).
 */
it('splits a column into sub-columns once it exceeds the row limit', () => {
  const users: GraphNodeInput[] = Array.from(
    { length: MAX_ROWS_PER_COLUMN + 2 },
    (_unused: unknown, index: number): GraphNodeInput => node(`u${index}`, 'user', `dev-${index}`),
  );

  const laidOut = applyColumnLayout(users);
  const overflow: string = `u${MAX_ROWS_PER_COLUMN}`;

  // Nadmiarowy węzeł wraca na górę, ale w kolejnej sub-kolumnie…
  expect(yOf(laidOut, overflow)).toBe(yOf(laidOut, 'u0'));
  expect(xOf(laidOut, overflow)).toBeGreaterThan(xOf(laidOut, 'u0'));
  // …więc stos nigdy nie rośnie ponad limit wierszy.
  expect(yOf(laidOut, `u${MAX_ROWS_PER_COLUMN - 1}`)).toBeLessThanOrEqual(
    (MAX_ROWS_PER_COLUMN - 1) * (yOf(laidOut, 'u1') - yOf(laidOut, 'u0')),
  );
});

it('keeps sub-columns of one type from overlapping the next type', () => {
  const nodes: GraphNodeInput[] = [
    ...Array.from(
      { length: MAX_ROWS_PER_COLUMN * 2 + 1 },
      (_unused: unknown, index: number): GraphNodeInput =>
        node(`u${index}`, 'user', `dev-${index}`),
    ),
    node('t1', 'team', 'DEV'),
    node('r1', 'repo', 'core-api'),
  ];

  const laidOut = applyColumnLayout(nodes);

  // Typy idą nadal od lewej do prawej, a najdalsza sub-kolumna osób nie wchodzi na zespoły.
  expect(xOf(laidOut, `u${MAX_ROWS_PER_COLUMN * 2}`)).toBeLessThan(xOf(laidOut, 't1'));
  expect(xOf(laidOut, 't1')).toBeLessThan(xOf(laidOut, 'r1'));
});
