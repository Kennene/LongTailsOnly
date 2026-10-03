import type { GraphNode } from '@/api/graph';
import { applyColumnLayout } from '@/lib/graphLayout';

const THREE_TYPES: GraphNode[] = [
  { id: 'u1', type: 'user', data: { label: 'kamil' } },
  { id: 't1', type: 'team', data: { label: 'DEV' } },
  { id: 'r1', type: 'repo', data: { label: 'core-api' } },
];

function xOf(nodes: GraphNode[], id: string): number {
  const node = nodes.find((candidate: GraphNode): boolean => candidate.id === id);

  if (node?.position === undefined) {
    throw new Error(`Node ${id} has no position`);
  }

  return node.position.x;
}

function yOf(nodes: GraphNode[], id: string): number {
  const node = nodes.find((candidate: GraphNode): boolean => candidate.id === id);

  if (node?.position === undefined) {
    throw new Error(`Node ${id} has no position`);
  }

  return node.position.y;
}

it('assigns deterministic columns by node type when position is missing', () => {
  const laidOut = applyColumnLayout(THREE_TYPES);

  expect(xOf(laidOut, 'u1')).toBeLessThan(xOf(laidOut, 't1'));
  expect(xOf(laidOut, 't1')).toBeLessThan(xOf(laidOut, 'r1'));
});

it('keeps rows in the order of appearance within a column', () => {
  const laidOut = applyColumnLayout([
    { id: 'u1', type: 'user', data: { label: 'anna' } },
    { id: 'u2', type: 'user', data: { label: 'bartek' } },
  ]);

  expect(xOf(laidOut, 'u1')).toBe(xOf(laidOut, 'u2'));
  expect(yOf(laidOut, 'u1')).toBeLessThan(yOf(laidOut, 'u2'));
});

it('starts every column at the top instead of stacking all nodes in one column', () => {
  const laidOut = applyColumnLayout([
    { id: 'u1', type: 'user', data: { label: 'anna' } },
    { id: 'u2', type: 'user', data: { label: 'bartek' } },
    { id: 'u3', type: 'user', data: { label: 'celina' } },
    { id: 'r1', type: 'repo', data: { label: 'core-api' } },
    { id: 'r2', type: 'repo', data: { label: 'payment-gw' } },
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
  const positioned: GraphNode[] = [
    { id: 'u1', type: 'user', position: { x: 42, y: 7 }, data: { label: 'anna' } },
  ];

  expect(applyColumnLayout(positioned)[0].position).toEqual({ x: 42, y: 7 });
});
