import '@xyflow/react/dist/style.css';

import {
  type AriaLabelConfig,
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
} from '@xyflow/react';
import { useTheme } from 'next-themes';

import { applyColumnLayout } from '@/lib/graphLayout';
import { getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';
import type { GraphEdge, GraphNode, LeaseStatus } from '@/types/api';

export interface PermissionsGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onlyRisk: boolean;
}

/** Statusy, które znaczą „podwyższone ryzyko” (spec §7.6). */
const RISK_STATUSES: readonly LeaseStatus[] = ['WARNING', 'EXPIRED'];

/** Legenda kolorów — te same rodziny stanów, których używa `getStatusBadge`. */
const LEGEND_STATUSES: readonly LeaseStatus[] = ['ACTIVE', 'WARNING', 'EXPIRED'];

/** Od najgroźniejszego: kolor węzła bierze najgorszy status z jego dostępów. */
const SEVERITY: readonly LeaseStatus[] = ['EXPIRED', 'WARNING', 'ACTIVE'];

/**
 * Wysokość panelu jest **wymierzona** (Chromium, dane demo): kolumna ma 7 wierszy po 72 px,
 * czyli 504 px treści, a przy 512 px `fitView` dobijał do `minZoom` i ścinał skrajne węzły.
 * 38rem (608 px) zostawia zapas, więc o powiększeniu decyduje szerokość panelu — przy 1440 px
 * okna etykiety węzłów mają ~12 px, a nie ~9 px.
 */
const PANE_CLASSES = 'h-[38rem] overflow-hidden rounded-xl border border-border bg-card';

/**
 * Dane węzła dla React Flow. Kontrakt (`GraphNodeData`) nie ma statusu — wisi on wyłącznie na
 * krawędziach dostępów, więc widok wylicza go z krawędzi i dokłada tutaj, żeby kolor węzła
 * nadal niósł stan uprawnień.
 */
type GraphDisplayData = {
  label: string;
  team: string | null;
  is_admin: boolean;
  status: LeaseStatus | null;
};

type FlowNode = Node<GraphDisplayData, GraphNode['type']>;

function hasElevatedRisk(status: LeaseStatus | null): boolean {
  return status !== null && RISK_STATUSES.includes(status);
}

/** Węzły dotknięte ryzykiem: końce krawędzi o statusie `WARNING`/`EXPIRED`. */
function collectRiskNodeIds(edges: GraphEdge[]): Set<string> {
  const ids = new Set<string>();

  edges.forEach((edge: GraphEdge): void => {
    if (hasElevatedRisk(edge.data.status)) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
  });

  return ids;
}

/** Najgorszy status węzła, wyliczony z jego krawędzi dostępów (bez krawędzi = brak statusu). */
function collectStatusByNode(edges: GraphEdge[]): Map<string, LeaseStatus> {
  const statuses = new Map<string, LeaseStatus>();

  function remember(nodeId: string, status: LeaseStatus | null): void {
    if (status === null) {
      return;
    }

    const current: LeaseStatus | undefined = statuses.get(nodeId);
    statuses.set(nodeId, current === undefined ? status : worseOf(current, status));
  }

  edges.forEach((edge: GraphEdge): void => {
    remember(edge.source, edge.data.status);
    remember(edge.target, edge.data.status);
  });

  return statuses;
}

function worseOf(current: LeaseStatus, candidate: LeaseStatus): LeaseStatus {
  return SEVERITY.indexOf(candidate) < SEVERITY.indexOf(current) ? candidate : current;
}

function labelOf(nodes: GraphNode[], id: string): string {
  return nodes.find((node: GraphNode): boolean => node.id === id)?.data.label ?? id;
}

function toFlowNodes(nodes: GraphNode[], statuses: Map<string, LeaseStatus>): FlowNode[] {
  return applyColumnLayout(nodes).map((node: GraphNode): FlowNode => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: { ...node.data, status: statuses.get(node.id) ?? null },
  }));
}

/**
 * Kolor krawędzi pochodzi z `getStatusBadge` (klasa `text-status-*` na grupie), a `stroke`
 * ustawiamy na `currentColor` — dzięki temu działa jedno źródło prawdy o kolorach stanu.
 * `animated` bierzemy z kontraktu (backend zapala je dla `WARNING`/`EXPIRED`).
 */
function toFlowEdges(edges: GraphEdge[], nodes: GraphNode[]): Edge[] {
  return edges.map((edge: GraphEdge): Edge => {
    const status: LeaseStatus | null = edge.data.status;
    const role = edge.data.role;
    const badge = status === null ? null : getStatusBadge(status);
    const roleLabel = role === null ? '' : ` (${getRoleLabel(role)})`;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: edge.animated,
      className: badge?.className,
      style: badge === null ? undefined : { stroke: 'currentColor' },
      ariaLabel: `${labelOf(nodes, edge.source)} → ${labelOf(nodes, edge.target)}${roleLabel}`,
    };
  });
}

/** Węzeł grafu: wypełnienie i obramowanie z rodziny statusu, etykiety po polsku obok koloru. */
function GraphStatusNode({ data }: NodeProps<FlowNode>): React.JSX.Element {
  const badge = data.status === null ? null : getStatusBadge(data.status);

  return (
    <div
      className={cn(
        'flex w-40 flex-col gap-0.5 rounded-lg border px-3 py-2 shadow-sm',
        badge === null ? 'border-border bg-card text-foreground' : badge.className,
      )}
    >
      <Handle className="opacity-0" position={Position.Left} type="target" />
      <span className="font-mono text-xs font-medium">{data.label}</span>
      {badge === null ? null : <span className="text-[0.65rem]">{badge.label}</span>}
      <Handle className="opacity-0" position={Position.Right} type="source" />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  user: GraphStatusNode,
  team: GraphStatusNode,
  repo: GraphStatusNode,
};

/**
 * Polskie etykiety dostępności wbudowanych elementów React Flow (UI po polsku).
 *
 * Opisy węzłów i krawędzi pomijają klawisz usuwania — graf jest widokiem tylko do odczytu.
 */
const ARIA_LABEL_CONFIG: Partial<AriaLabelConfig> = {
  'controls.ariaLabel': 'Sterowanie widokiem grafu',
  'controls.zoomIn.ariaLabel': 'Przybliż',
  'controls.zoomOut.ariaLabel': 'Oddal',
  'controls.fitView.ariaLabel': 'Dopasuj widok',
  'handle.ariaLabel': 'Punkt połączenia krawędzi',
  'node.a11yDescription.default':
    'Naciśnij Enter lub spację, aby zaznaczyć węzeł. Naciśnij Escape, aby anulować.',
  'edge.a11yDescription.default':
    'Naciśnij Enter lub spację, aby zaznaczyć krawędź. Naciśnij Escape, aby anulować.',
};

function GraphLegend(): React.JSX.Element {
  return (
    <ul className="flex flex-wrap items-center gap-4 text-xs">
      {LEGEND_STATUSES.map((status: LeaseStatus): React.JSX.Element => {
        const badge = getStatusBadge(status);

        return (
          <li key={status} className={cn('flex items-center gap-1.5', badge.className)}>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
            {badge.label}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Graf uprawnień na `@xyflow/react`.
 *
 * Liczniki widocznych elementów (`graph-nodes`, `graph-edges`) wystawiamy obok grafu, bo React
 * Flow potrzebuje zmierzonego kontenera, którego jsdom nie zapewnia — testy czytają liczniki.
 * `onlyRisk` zostawia wyłącznie węzły połączone krawędzią `WARNING`/`EXPIRED` oraz te krawędzie.
 */
export function PermissionsGraph({
  nodes,
  edges,
  onlyRisk,
}: PermissionsGraphProps): React.JSX.Element {
  const { theme = 'system' } = useTheme();
  const riskNodeIds = collectRiskNodeIds(edges);
  const statuses = collectStatusByNode(edges);
  const visibleNodes = onlyRisk
    ? nodes.filter((node: GraphNode): boolean => riskNodeIds.has(node.id))
    : nodes;
  const visibleNodeIds = new Set(visibleNodes.map((node: GraphNode): string => node.id));
  const visibleEdges = edges.filter(
    (edge: GraphEdge): boolean =>
      (!onlyRisk || hasElevatedRisk(edge.data.status)) &&
      visibleNodeIds.has(edge.source) &&
      visibleNodeIds.has(edge.target),
  );

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
          </span>
        </p>
        <GraphLegend />
      </div>

      {visibleNodes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Brak danych do wyświetlenia
        </p>
      ) : (
        <div className={PANE_CLASSES}>
          <ReactFlow
            ariaLabelConfig={ARIA_LABEL_CONFIG}
            colorMode={theme === 'light' ? 'light' : 'dark'}
            edges={toFlowEdges(visibleEdges, visibleNodes)}
            fitView
            // Domyślne 0.5 ucinało graf na wąskim panelu (węzły poza ramką). 0.3 to bezpiecznik:
            // przy typowej szerokości `fitView` i tak dobiera ~0.8–1.0, więc etykiety są czytelne.
            minZoom={0.3}
            nodes={toFlowNodes(visibleNodes, statuses)}
            nodesConnectable={false}
            nodesDraggable={false}
            nodeTypes={NODE_TYPES}
          >
            <Background color="var(--border)" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
