import '@xyflow/react/dist/style.css';

import {
  type AriaLabelConfig,
  Background,
  Controls,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
  ReactFlow,
} from '@xyflow/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import type { LayoutPositions } from '@/lib/graphForceLayout';
import {
  type GraphHighlight,
  highlightOf,
  isElevatedRisk,
  neighboursOf,
  worseStatus,
} from '@/lib/graphHighlight';
import { getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import type { GraphEdge, GraphNode, LeaseStatus } from '@/types/api';

import { FloatingEdge } from './FloatingEdge';
import { GraphCircleNode } from './GraphCircleNode';
import { GraphDetailsPanel } from './GraphDetailsPanel';
import {
  type CircleFlowNode,
  colorModeOf,
  type Emphasis,
  emphasisOf,
  type FloatingFlowEdge,
} from './graphFlow';
import { GraphLegend } from './GraphLegend';
import { applyOverrideChanges, type NodeOverrides } from './nodeOverrides';

export interface PermissionsGraphProps {
  /** Węzły i krawędzie po filtrze zespołu (`GraphPage`). */
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Układ pajęczyny policzony na **pełnym** grafie — filtry nie przesuwają węzłów. */
  positions: LayoutPositions;
  onlyRisk: boolean;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
}

/**
 * Wysokość panelu: pajęczyna demo (31 węzłów) jest mniej więcej kwadratowa, więc wysoki panel daje
 * `fitView` większe powiększenie niż szeroki i niski — etykiety w okręgach zostają czytelne.
 */
const PANE_CLASSES = 'h-[40rem] overflow-hidden rounded-xl border border-border bg-card';

const NODE_TYPES: NodeTypes = { circle: GraphCircleNode };
const EDGE_TYPES: EdgeTypes = { floating: FloatingEdge };

/**
 * Polskie etykiety dostępności wbudowanych elementów React Flow (UI po polsku). Węzły zaznacza
 * się przyciskiem w środku okręgu, więc opisy węzłów i krawędzi React Flow nie są potrzebne.
 */
const ARIA_LABEL_CONFIG: Partial<AriaLabelConfig> = {
  'controls.ariaLabel': 'Sterowanie widokiem grafu',
  'controls.zoomIn.ariaLabel': 'Przybliż',
  'controls.zoomOut.ariaLabel': 'Oddal',
  'controls.fitView.ariaLabel': 'Dopasuj widok',
  'handle.ariaLabel': 'Punkt połączenia krawędzi',
};

/** Węzły dotknięte ryzykiem: końce krawędzi o statusie `WARNING`/`EXPIRED`. */
function collectRiskNodeIds(edges: GraphEdge[]): Set<string> {
  const ids = new Set<string>();

  edges.forEach((edge: GraphEdge): void => {
    if (isElevatedRisk(edge.data.status)) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
  });

  return ids;
}

/** Najgorszy status węzła, wyliczony z jego krawędzi dzierżaw (bez krawędzi = brak statusu). */
function collectStatusByNode(edges: GraphEdge[]): Map<string, LeaseStatus | null> {
  const statuses = new Map<string, LeaseStatus | null>();

  edges.forEach((edge: GraphEdge): void => {
    [edge.source, edge.target].forEach((nodeId: string): void => {
      statuses.set(nodeId, worseStatus(statuses.get(nodeId) ?? null, edge.data.status));
    });
  });

  return statuses;
}

/** Liczba relacji do `aria-label`: członkowie zespołu, a dla osoby i repo — dzierżawy. */
function relationCount(node: GraphNode, edges: GraphEdge[]): number {
  const kind: GraphEdge['data']['kind'] = node.type === 'team' ? 'membership' : 'lease';

  return edges.filter(
    (edge: GraphEdge): boolean =>
      edge.data.kind === kind && (edge.source === node.id || edge.target === node.id),
  ).length;
}

function labelOf(nodes: GraphNode[], id: string): string {
  return nodes.find((node: GraphNode): boolean => node.id === id)?.data.label ?? id;
}

/**
 * Graf uprawnień jako pajęczyna (`@xyflow/react` + układ z `lib/graphForceLayout.ts`).
 *
 * Liczniki widocznych elementów (`graph-nodes`, `graph-edges`, `graph-highlighted`) wystawiamy obok
 * grafu, bo React Flow potrzebuje zmierzonego kontenera, którego jsdom nie zapewnia.
 * `onlyRisk` zostawia wyłącznie węzły połączone krawędzią `WARNING`/`EXPIRED` oraz te krawędzie.
 * Zaznaczenie (drogi dostępu) liczy `lib/graphHighlight.ts`; reszta grafu wygasa do ~15%.
 */
export function PermissionsGraph({
  nodes,
  edges,
  positions,
  onlyRisk,
  selectedId,
  onSelect,
}: PermissionsGraphProps): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<NodeOverrides>({});

  // Escape czyści zaznaczenie niezależnie od tego, gdzie jest fokus (węzeł, lista, tło).
  useEffect((): (() => void) => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onSelect(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelect]);

  const riskNodeIds = collectRiskNodeIds(edges);
  const statuses = collectStatusByNode(edges);
  const visibleNodes = onlyRisk
    ? nodes.filter((node: GraphNode): boolean => riskNodeIds.has(node.id))
    : nodes;
  const visibleNodeIds = new Set(visibleNodes.map((node: GraphNode): string => node.id));
  const visibleEdges = edges.filter(
    (edge: GraphEdge): boolean =>
      (!onlyRisk || isElevatedRisk(edge.data.status)) &&
      visibleNodeIds.has(edge.source) &&
      visibleNodeIds.has(edge.target),
  );

  const selection: GraphHighlight | null = highlightOf(visibleNodes, visibleEdges, selectedId);
  const hover: GraphHighlight | null =
    selection === null && hoveredId !== null && visibleNodeIds.has(hoveredId)
      ? neighboursOf(visibleEdges, hoveredId)
      : null;

  const flowNodes: CircleFlowNode[] = visibleNodes.map((node: GraphNode): CircleFlowNode => {
    const emphasis: Emphasis = emphasisOf(
      (highlight: GraphHighlight): boolean => highlight.nodeIds.has(node.id),
      selection,
      hover,
    );

    return {
      id: node.id,
      type: 'circle',
      position: overrides[node.id]?.position ?? positions[node.id] ?? { x: 0, y: 0 },
      measured: overrides[node.id]?.measured,
      // Podświetlone węzły nad wygaszonymi, żeby wygaszony okrąg nie przykrywał drogi dostępu.
      zIndex: emphasis === 'active' || emphasis === 'hovered' ? 1 : 0,
      data: {
        label: node.data.label,
        kind: node.type,
        status: statuses.get(node.id) ?? null,
        relations: relationCount(node, visibleEdges),
        emphasis,
        selected: node.id === selectedId,
        onSelect,
      },
    };
  });

  /**
   * Kolor krawędzi pochodzi z `getStatusBadge` (klasa `text-status-*` na grupie), a ścieżka
   * i grot rysują `currentColor` — jedno źródło prawdy o kolorach stanu. Członkostwo nie ma
   * statusu, więc jest neutralne.
   */
  const flowEdges: FloatingFlowEdge[] = visibleEdges.map((edge: GraphEdge): FloatingFlowEdge => {
    const status: LeaseStatus | null = edge.data.status;
    const role = edge.data.role;
    const emphasis: Emphasis = emphasisOf(
      (highlight: GraphHighlight): boolean => highlight.edgeIds.has(edge.id),
      selection,
      hover,
    );

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'floating',
      className: status === null ? 'text-muted-foreground' : getStatusBadge(status).className,
      zIndex: emphasis === 'active' ? 1 : 0,
      focusable: false,
      data: { kind: edge.data.kind, role, emphasis },
      ariaLabel: `${labelOf(nodes, edge.source)} → ${labelOf(nodes, edge.target)}${role === null ? '' : ` (${getRoleLabel(role)})`}`,
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Widoczne węzły:{' '}
          <span className="font-mono text-foreground tabular-nums" data-testid="graph-nodes">
            {visibleNodes.length}
          </span>{' '}
          · widoczne krawędzie:{' '}
          <span className="font-mono text-foreground tabular-nums" data-testid="graph-edges">
            {visibleEdges.length}
          </span>{' '}
          · podświetlone węzły:{' '}
          <span className="font-mono text-foreground tabular-nums" data-testid="graph-highlighted">
            {selection?.nodeIds.size ?? 0}
          </span>
        </p>
        <GraphLegend />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {visibleNodes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Brak danych do wyświetlenia
          </p>
        ) : (
          <div className={PANE_CLASSES}>
            <ReactFlow
              ariaLabelConfig={ARIA_LABEL_CONFIG}
              colorMode={colorModeOf(resolvedTheme)}
              edges={flowEdges}
              edgesFocusable={false}
              edgeTypes={EDGE_TYPES}
              elementsSelectable={false}
              fitView
              fitViewOptions={{ padding: 0.08 }}
              // Nowy zestaw widocznych węzłów (filtr) montuje widok od nowa, żeby `fitView` objął
              // dokładnie to, co zostało — zaznaczenie i hover nie zmieniają klucza.
              key={[...visibleNodeIds].join('|')}
              minZoom={0.2}
              nodes={flowNodes}
              nodesConnectable={false}
              nodesDraggable
              nodesFocusable={false}
              nodeTypes={NODE_TYPES}
              onNodeMouseEnter={(_event: React.MouseEvent, node: Node): void =>
                setHoveredId(node.id)
              }
              onNodeMouseLeave={(): void => setHoveredId(null)}
              onNodesChange={(changes: NodeChange<CircleFlowNode>[]): void =>
                setOverrides((current: NodeOverrides): NodeOverrides =>
                  applyOverrideChanges(current, changes),
                )
              }
              onPaneClick={(): void => onSelect(null)}
            >
              <Background color="var(--border)" gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        )}
        <GraphDetailsPanel
          edges={visibleEdges}
          nodes={visibleNodes}
          onSelect={onSelect}
          selectedId={selection === null ? null : selectedId}
        />
      </div>
    </div>
  );
}
