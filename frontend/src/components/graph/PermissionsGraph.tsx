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

import type { GraphEdge, GraphNode } from '@/api/graph';
import { applyColumnLayout } from '@/lib/graphLayout';
import { getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';
import type { LeaseStatus } from '@/types/api';

export interface PermissionsGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onlyRisk: boolean;
}

/** Statusy, które znaczą „podwyższone ryzyko” (spec §7.6). */
const RISK_STATUSES: readonly LeaseStatus[] = ['WARNING', 'EXPIRED'];

/** Legenda kolorów — te same rodziny stanów, których używa `getStatusBadge`. */
const LEGEND_STATUSES: readonly LeaseStatus[] = ['ACTIVE', 'WARNING', 'EXPIRED'];

type GraphNodeData = GraphNode['data'];
type FlowNode = Node<GraphNodeData, GraphNode['type']>;

function hasElevatedRisk(status: LeaseStatus | undefined): boolean {
  return status !== undefined && RISK_STATUSES.includes(status);
}

/** Węzły dotknięte ryzykiem: końce krawędzi o statusie `WARNING`/`EXPIRED`. */
function collectRiskNodeIds(edges: GraphEdge[]): Set<string> {
  const ids = new Set<string>();

  edges.forEach((edge: GraphEdge): void => {
    if (hasElevatedRisk(edge.data?.status)) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
  });

  return ids;
}

function labelOf(nodes: GraphNode[], id: string): string {
  return nodes.find((node: GraphNode): boolean => node.id === id)?.data.label ?? id;
}

function toFlowNodes(nodes: GraphNode[]): FlowNode[] {
  return applyColumnLayout(nodes).map((node: GraphNode): FlowNode => ({
    id: node.id,
    type: node.type,
    position: node.position ?? { x: 0, y: 0 },
    data: node.data,
  }));
}

/**
 * Kolor krawędzi pochodzi z `getStatusBadge` (klasa `text-status-*` na grupie), a `stroke`
 * ustawiamy na `currentColor` — dzięki temu działa jedno źródło prawdy o kolorach stanu.
 */
function toFlowEdges(edges: GraphEdge[], nodes: GraphNode[]): Edge[] {
  return edges.map((edge: GraphEdge): Edge => {
    const status = edge.data?.status;
    const role = edge.data?.role;
    const badge = status === undefined ? null : getStatusBadge(status);
    const roleLabel = role === undefined ? '' : ` (${getRoleLabel(role)})`;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      className: badge?.className,
      style: badge === null ? undefined : { stroke: 'currentColor' },
      ariaLabel: `${labelOf(nodes, edge.source)} → ${labelOf(nodes, edge.target)}${roleLabel}`,
    };
  });
}

/** Węzeł grafu: wypełnienie i obramowanie z rodziny statusu, etykiety po polsku obok koloru. */
function GraphStatusNode({ data }: NodeProps<FlowNode>): React.JSX.Element {
  const badge = data.status === undefined ? null : getStatusBadge(data.status);

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
  const visibleNodes = onlyRisk
    ? nodes.filter((node: GraphNode): boolean => riskNodeIds.has(node.id))
    : nodes;
  const visibleNodeIds = new Set(visibleNodes.map((node: GraphNode): string => node.id));
  const visibleEdges = edges.filter(
    (edge: GraphEdge): boolean =>
      (!onlyRisk || hasElevatedRisk(edge.data?.status)) &&
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
        <div className="h-[32rem] overflow-hidden rounded-xl border border-border bg-card">
          <ReactFlow
            ariaLabelConfig={ARIA_LABEL_CONFIG}
            colorMode={theme === 'light' ? 'light' : 'dark'}
            edges={toFlowEdges(visibleEdges, visibleNodes)}
            fitView
            nodes={toFlowNodes(visibleNodes)}
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
