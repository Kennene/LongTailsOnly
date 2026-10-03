import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useExpandedSet } from '@/hooks/useExpandedSet';

describe('useExpandedSet', () => {
  it('starts with every group collapsed', () => {
    const { result } = renderHook(() => useExpandedSet<number>());

    expect(result.current.isExpanded(1)).toBe(false);
    expect(result.current.areAllExpanded([1, 2])).toBe(false);
  });

  it('toggles a single group open and closed', () => {
    const { result } = renderHook(() => useExpandedSet<string>());

    act(() => result.current.toggle('kamil'));
    expect(result.current.isExpanded('kamil')).toBe(true);
    expect(result.current.isExpanded('marta')).toBe(false);

    act(() => result.current.toggle('kamil'));
    expect(result.current.isExpanded('kamil')).toBe(false);
  });

  it('expands every group, then collapses them all on the second call', () => {
    const { result } = renderHook(() => useExpandedSet<number>());

    act(() => result.current.toggleAll([1, 2, 3]));
    expect(result.current.areAllExpanded([1, 2, 3])).toBe(true);

    act(() => result.current.toggleAll([1, 2, 3]));
    expect(result.current.isExpanded(1)).toBe(false);
    expect(result.current.areAllExpanded([1, 2, 3])).toBe(false);
  });

  it('expands the rest when only some groups are open', () => {
    const { result } = renderHook(() => useExpandedSet<number>());

    act(() => result.current.toggle(2));
    act(() => result.current.toggleAll([1, 2]));

    expect(result.current.areAllExpanded([1, 2])).toBe(true);
  });

  it('treats an empty list of groups as not expanded', () => {
    const { result } = renderHook(() => useExpandedSet<number>());

    expect(result.current.areAllExpanded([])).toBe(false);
  });
});
