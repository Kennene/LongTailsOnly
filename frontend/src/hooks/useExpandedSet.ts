import { useState } from 'react';

export interface ExpandedSet<K> {
  isExpanded: (key: K) => boolean;
  areAllExpanded: (keys: readonly K[]) => boolean;
  toggle: (key: K) => void;
  /** Rozwija wszystkie grupy, a gdy już są rozwinięte — zwija je. */
  toggleAll: (keys: readonly K[]) => void;
}

/** Stan rozwiniętych grup listy (wiersz osoby, aktora…); domyślnie wszystko zwinięte. */
export function useExpandedSet<K>(): ExpandedSet<K> {
  const [expanded, setExpanded] = useState<ReadonlySet<K>>(new Set());

  function areAllExpanded(keys: readonly K[]): boolean {
    return keys.length > 0 && keys.every((key: K): boolean => expanded.has(key));
  }

  function toggle(key: K): void {
    const next: Set<K> = new Set(expanded);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpanded(next);
  }

  function toggleAll(keys: readonly K[]): void {
    setExpanded(areAllExpanded(keys) ? new Set() : new Set(keys));
  }

  return { isExpanded: (key: K): boolean => expanded.has(key), areAllExpanded, toggle, toggleAll };
}
