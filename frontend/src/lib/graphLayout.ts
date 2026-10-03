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
 * `x` wynika z typu węzła (`user` < `team` < `repo`), a `y` z **kolejności w obrębie kolumny** —
 * nie z indeksu w całej tablicy. Licznik globalny układał wszystkie węzły w jednej kolumnie
 * (12 węzłów → 1108 px wysokości w oknie 512 px, więc `fitView` nie mieścił grafu).
 * Węzły, które przyniosły `position` z API, zostają nietknięte, więc funkcja jest idempotentna.
 */
export function applyColumnLayout(nodes: GraphNode[]): GraphNode[] {
  const rowsByType = new Map<GraphNode['type'], number>();

  return nodes.map((node: GraphNode): GraphNode => {
    const row: number = rowsByType.get(node.type) ?? 0;
    rowsByType.set(node.type, row + 1);

    return node.position === undefined
      ? { ...node, position: { x: COLUMN_X[node.type], y: row * ROW_GAP } }
      : node;
  });
}
