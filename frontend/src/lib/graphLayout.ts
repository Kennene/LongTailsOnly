import type { GraphNode } from '@/api/graph';

/** Kolumna każdego typu węzła (oś X), od lewej: osoby → zespoły → repozytoria. */
const COLUMN_X: Record<GraphNode['type'], number> = {
  user: 0,
  team: 360,
  repo: 720,
};

/** Odstęp między wierszami (oś Y) — na tyle duży, żeby karty węzłów się nie nachodziły. */
const ROW_GAP = 96;

/**
 * Deterministyczny układ kolumnowy dla węzłów bez `position` (spec §7.6).
 *
 * `x` wynika z typu węzła (`user` < `team` < `repo`), `y` z kolejności występowania na liście.
 * Węzły, które przyniosły `position` z API, zostają nietknięte — dlatego funkcja jest
 * idempotentna i można ją bezpiecznie wywołać ponownie po każdej zmianie filtrów.
 */
export function applyColumnLayout(nodes: GraphNode[]): GraphNode[] {
  return nodes.map((node: GraphNode, index: number): GraphNode =>
    node.position === undefined
      ? { ...node, position: { x: COLUMN_X[node.type], y: index * ROW_GAP } }
      : node,
  );
}
