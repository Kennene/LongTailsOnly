import { describe, expect, it } from 'vitest';

import { formatCountPl, groupBy } from '@/lib/grouping';

describe('groupBy', () => {
  it('collects items under their key and keeps the order of first appearance', () => {
    const groups: Map<string, number[]> = groupBy([3, 10, 4, 11, 5], (value: number): string =>
      value > 9 ? 'big' : 'small',
    );

    expect([...groups.keys()]).toEqual(['small', 'big']);
    expect(groups.get('small')).toEqual([3, 4, 5]);
    expect(groups.get('big')).toEqual([10, 11]);
  });

  it('returns an empty map for an empty list', () => {
    expect(groupBy([], (value: number): number => value).size).toBe(0);
  });
});

describe('formatCountPl', () => {
  const ENTRIES = { one: 'wpis', few: 'wpisy', many: 'wpisów' } as const;

  it.each([
    [1, '1 wpis'],
    [2, '2 wpisy'],
    [4, '4 wpisy'],
    [5, '5 wpisów'],
    [11, '11 wpisów'],
    [12, '12 wpisów'],
    [14, '14 wpisów'],
    [22, '22 wpisy'],
    [25, '25 wpisów'],
    [0, '0 wpisów'],
  ])('formats %i as "%s"', (count: number, expected: string) => {
    expect(formatCountPl(count, ENTRIES)).toBe(expected);
  });
});
