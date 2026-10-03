import type { GraphNode, GraphPosition } from '@/types/api';

/**
 * Węzeł grafu, któremu odpowiedź API może nie dostarczyć `position`.
 *
 * Kontrakt (`GraphNode`, ADR 0009/0011 §4) wymaga `position`, ale graf jest widokiem
 * defensywnym: gdy pole jednak nie przyjdzie, dokładamy układ kolumnowy zamiast wywalać
 * widok. Węzły z `position` przechodzą nietknięte.
 */
export type GraphNodeInput = Omit<GraphNode, 'position'> & { position?: GraphPosition };

/** Kolejność kolumn od lewej: osoby → zespoły → repozytoria. */
const COLUMN_ORDER: readonly GraphNode['type'][] = ['user', 'team', 'repo'];

/**
 * Ile wierszy mieści jedna sub-kolumna, zanim kolumna pęknie na kolejną.
 *
 * Dane demo mają 19 osób i 10 repozytoriów; jeden stos 19 kart to 1400 px wysokości, czego
 * `fitView` nie zmieści w oknie 512 px (przy `minZoom` 0.5 węzły wychodziły poza panel —
 * defekt z audytu). Po podziale najdłuższy stos ma 7 kart, więc graf mieści się bez ścinania.
 */
export const MAX_ROWS_PER_COLUMN = 7;

/** Odstęp między wierszami (oś Y) — karta węzła ma ~48 px, więc 72 px to wciąż czytelna przerwa. */
const ROW_GAP = 72;

/**
 * Szerokość sub-kolumny (oś X): karta węzła ma 160 px, więc 184 px zostawia 24 px odstępu —
 * tyle samo, ile zostaje w pionie między kartami (`ROW_GAP` 72 px przy karcie ~48 px).
 * Przy 6 sub-kolumnach danych demo daje to 1080 px szerokości i pozwala `fitView` dobić
 * do ~0.95 powiększenia w panelu 1135 px, czyli etykiety ~11 px zamiast ~9 px.
 */
const SUB_COLUMN_GAP = 184;

/**
 * Deterministyczny układ kolumnowy dla węzłów bez `position` (spec §7.6).
 *
 * `x` wynika z typu węzła (`user` < `team` < `repo`), a `y` z **kolejności w obrębie kolumny** —
 * nie z indeksu w całej tablicy. Gdy typ ma więcej niż `MAX_ROWS_PER_COLUMN` węzłów, kolumna
 * pęka na sub-kolumny (kolejna sub-kolumna startuje od góry, z `x` przesuniętym o `SUB_COLUMN_GAP`),
 * a typy rozsuwają się tak, żeby sub-kolumny się nie nachodziły. Węzły, które przyniosły
 * `position` z API, zostają nietknięte, więc funkcja jest idempotentna.
 */
export function applyColumnLayout(nodes: GraphNodeInput[]): GraphNode[] {
  const rowsByType = new Map<GraphNode['type'], number>();
  const columnX: Record<GraphNode['type'], number> = columnOrigins(nodes);

  return nodes.map((node: GraphNodeInput): GraphNode => {
    const row: number = rowsByType.get(node.type) ?? 0;
    rowsByType.set(node.type, row + 1);

    if (node.position !== undefined) {
      return { ...node, position: node.position };
    }

    const subColumn: number = Math.floor(row / MAX_ROWS_PER_COLUMN);

    return {
      ...node,
      position: {
        x: columnX[node.type] + subColumn * SUB_COLUMN_GAP,
        y: (row % MAX_ROWS_PER_COLUMN) * ROW_GAP,
      },
    };
  });
}

/** Lewa krawędź pierwszej sub-kolumny każdego typu — tyle sub-kolumn, ile wymaga najdłuższy stos. */
function columnOrigins(nodes: GraphNodeInput[]): Record<GraphNode['type'], number> {
  const counts: Record<GraphNode['type'], number> = { user: 0, team: 0, repo: 0 };
  nodes.forEach((node: GraphNodeInput): void => {
    counts[node.type] += 1;
  });

  const origins: Record<GraphNode['type'], number> = { user: 0, team: 0, repo: 0 };
  let cursor = 0;

  COLUMN_ORDER.forEach((type: GraphNode['type']): void => {
    origins[type] = cursor;
    const subColumns: number = Math.max(1, Math.ceil(counts[type] / MAX_ROWS_PER_COLUMN));
    cursor += subColumns * SUB_COLUMN_GAP;
  });

  return origins;
}
