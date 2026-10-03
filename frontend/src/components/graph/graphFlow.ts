import type { ColorMode, Edge, Node } from '@xyflow/react';

import type { GraphHighlight } from '@/lib/graphHighlight';
import type { GraphNode, LeaseStatus, Role } from '@/types/api';

/**
 * Wypełnienie wg typu z rampy kategorycznej `--chart-*` (DESIGN.md §4: rampa dla grafu), jako
 * delikatny tint — kolor stanu zostaje dla obrysu i kropki, żeby typ i status się nie myliły.
 */
export const TYPE_FILL: Record<GraphNode['type'], string> = {
  team: 'bg-chart-4/30',
  user: 'bg-chart-1/20',
  repo: 'bg-chart-5/20',
};

/**
 * Jak mocno element grafu ma być widoczny:
 * - `none` — nic nie jest zaznaczone ani najechane,
 * - `active` — należy do dróg dostępu zaznaczonego węzła (pełny kolor, animacja, etykieta roli),
 * - `faded` — nie należy do zaznaczenia (wygaszony do ~15%),
 * - `hovered` — sąsiad najechanego węzła (lekkie podświetlenie bez zaznaczenia),
 * - `background` — reszta grafu przy hoverze (przygaszona, ale czytelna).
 */
export type Emphasis = 'none' | 'active' | 'faded' | 'hovered' | 'background';

/**
 * Dane węzła dla React Flow. Kontrakt (`GraphNodeData`) nie ma statusu — wisi on wyłącznie na
 * krawędziach dostępów, więc widok wylicza najgorszy status z krawędzi i dokłada go tutaj.
 */
export type CircleNodeData = {
  label: string;
  kind: GraphNode['type'];
  status: LeaseStatus | null;
  /** Liczba relacji pokazywana w `aria-label` (dostępy osoby, osoby repo, członkowie zespołu). */
  relations: number;
  emphasis: Emphasis;
  selected: boolean;
  onSelect: (nodeId: string) => void;
};

export type CircleFlowNode = Node<CircleNodeData, 'circle'>;

/** Dane krawędzi: rodzaj i rola sterują grubością, status — kolorem (przez `className` krawędzi). */
export type FloatingEdgeData = {
  kind: 'membership' | 'lease';
  role: Role | null;
  emphasis: Emphasis;
};

export type FloatingFlowEdge = Edge<FloatingEdgeData, 'floating'>;

/**
 * Tryb kolorów React Flow. Biblioteka w trybie `dark` dokłada klasę `dark` na kontener grafu,
 * a ta przełącza tokeny `index.css` na ciemne — dlatego tryb musi iść za motywem aplikacji, a nie
 * być domyślnie ciemny. Bez `ThemeProvider` (`resolvedTheme` = `undefined`) motyw niesie klasa
 * `dark` na `<html>` (ADR 0001).
 */
export function colorModeOf(resolvedTheme: string | undefined): ColorMode {
  if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
    return resolvedTheme;
  }

  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** Widoczność elementu: zaznaczenie ma pierwszeństwo przed hoverem, hover — przed spoczynkiem. */
export function emphasisOf(
  inHighlight: (highlight: GraphHighlight) => boolean,
  selection: GraphHighlight | null,
  hover: GraphHighlight | null,
): Emphasis {
  if (selection !== null) {
    return inHighlight(selection) ? 'active' : 'faded';
  }
  if (hover !== null) {
    return inHighlight(hover) ? 'hovered' : 'background';
  }

  return 'none';
}
