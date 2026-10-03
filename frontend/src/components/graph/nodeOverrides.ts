import type { NodeChange, XYPosition } from '@xyflow/react';

/** Co widok zapamiętuje ponad wyliczony układ: pozycję po przeciągnięciu i zmierzony rozmiar. */
export interface NodeOverride {
  position?: XYPosition;
  measured?: { width: number; height: number };
}

export type NodeOverrides = Record<string, NodeOverride>;

/**
 * Nakłada zmiany z `onNodesChange` na zapamiętane nadpisania węzłów.
 *
 * Węzły grafu są kontrolowane i budowane od nowa przy każdej zmianie zaznaczenia czy filtra, więc
 * React Flow „zapomniałby” przeciągnięcie i pomiar. Trzymamy je osobno, po `id`: przeciągnięty
 * węzeł zostaje tam, gdzie go puszczono (także po zmianie filtrów), a `measured` jest potrzebne,
 * bo bez niego React Flow nie zna uchwytów i nie rysuje krawędzi. Zaznaczenie React Flow
 * ignorujemy — zaznaczeniem steruje widok (URL), nie biblioteka.
 */
export function applyOverrideChanges(
  overrides: NodeOverrides,
  changes: NodeChange[],
): NodeOverrides {
  let next: NodeOverrides = overrides;

  function patch(id: string, override: NodeOverride): void {
    next = { ...next, [id]: { ...next[id], ...override } };
  }

  changes.forEach((change: NodeChange): void => {
    if (change.type === 'position' && change.position !== undefined) {
      patch(change.id, { position: change.position });
    } else if (change.type === 'dimensions' && change.dimensions !== undefined) {
      patch(change.id, { measured: change.dimensions });
    }
  });

  return next;
}
