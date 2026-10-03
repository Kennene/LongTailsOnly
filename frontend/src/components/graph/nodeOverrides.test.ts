import type { NodeChange } from '@xyflow/react';

import { applyOverrideChanges, type NodeOverrides } from './nodeOverrides';

it('keeps a dragged node where it was dropped', () => {
  const changes: NodeChange[] = [
    { id: 'user:kamil', type: 'position', position: { x: 10, y: 20 }, dragging: true },
    { id: 'user:kamil', type: 'position', position: { x: 15, y: 25 }, dragging: false },
  ];

  expect(applyOverrideChanges({}, changes)['user:kamil']?.position).toEqual({ x: 15, y: 25 });
});

it('remembers measured dimensions, so edges can be drawn for controlled nodes', () => {
  const changes: NodeChange[] = [
    { id: 'repo:core-api', type: 'dimensions', dimensions: { width: 72, height: 72 } },
  ];

  expect(applyOverrideChanges({}, changes)['repo:core-api']?.measured).toEqual({
    width: 72,
    height: 72,
  });
});

it('keeps earlier overrides of other nodes and other fields untouched', () => {
  const before: NodeOverrides = {
    'user:kamil': { position: { x: 1, y: 2 }, measured: { width: 80, height: 80 } },
  };
  const changes: NodeChange[] = [
    { id: 'user:kamil', type: 'position', position: { x: 3, y: 4 } },
    { id: 'user:ola', type: 'select', selected: true },
  ];

  expect(applyOverrideChanges(before, changes)).toEqual({
    'user:kamil': { position: { x: 3, y: 4 }, measured: { width: 80, height: 80 } },
  });
});

it('returns the same object when nothing relevant changed', () => {
  const before: NodeOverrides = {};

  expect(applyOverrideChanges(before, [{ id: 'user:ola', type: 'select', selected: true }])).toBe(
    before,
  );
});
