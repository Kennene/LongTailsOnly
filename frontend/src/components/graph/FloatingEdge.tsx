import {
  EdgeLabelRenderer,
  type EdgeProps,
  getStraightPath,
  type InternalNode,
  useInternalNode,
  type XYPosition,
} from '@xyflow/react';

import { getRoleLabel } from '@/lib/statusBadges';
import type { Role } from '@/types/api';

import type { Emphasis, FloatingFlowEdge } from './graphFlow';

/** Grubość wg roli: admin > write > read; członkostwo jest cienkie, bo nie nadaje dostępu. */
const ROLE_WIDTH: Record<Role, number> = { admin: 3, write: 2, read: 1.25 };
const MEMBERSHIP_WIDTH = 1.25;

/** Podświetlona droga dostępu jest wyraźnie grubsza; hover pogrubia lekko. */
const EMPHASIS_WIDTH: Record<Emphasis, number> = {
  none: 1,
  active: 1.75,
  hovered: 1.35,
  background: 1,
  faded: 1,
};

const EMPHASIS_OPACITY: Record<Emphasis, number> = {
  none: 0.75,
  active: 1,
  hovered: 1,
  background: 0.3,
  faded: 0.1,
};

/** Grot strzałki stoi w niewielkim odstępie od okręgu, żeby nie wchodził na obrys węzła. */
const ARROW_GAP = 3;

/**
 * Przybliżona szerokość etykiety roli w px (`text-xs` Geist ≈ 6,6 px na znak + padding). Etykieta
 * leży wzdłuż krawędzi, więc mieści się, gdy widoczny odcinek jest od niej dłuższy.
 */
function labelFits(segmentLength: number, text: string): boolean {
  return segmentLength >= text.length * 6.6 + 16;
}

/** Kąt odcinka w stopniach, obrócony tak, żeby tekst nigdy nie stał „do góry nogami”. */
function readableAngle(start: XYPosition, end: XYPosition): number {
  const degrees: number = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

  return degrees > 90 ? degrees - 180 : degrees < -90 ? degrees + 180 : degrees;
}

/** Środek okręgu i jego promień z węzła wewnętrznego React Flow (pozycja + zmierzony rozmiar). */
function circleOf(node: InternalNode): { centre: XYPosition; radius: number } {
  const width: number = node.measured.width ?? 0;
  const height: number = node.measured.height ?? 0;

  return {
    centre: {
      x: node.internals.positionAbsolute.x + width / 2,
      y: node.internals.positionAbsolute.y + height / 2,
    },
    radius: Math.min(width, height) / 2,
  };
}

/** Punkt na brzegu okręgu `from` w kierunku punktu `towards`. */
function pointOnRim(from: XYPosition, radius: number, towards: XYPosition): XYPosition {
  const dx: number = towards.x - from.x;
  const dy: number = towards.y - from.y;
  const distance: number = Math.hypot(dx, dy) || 1;

  return { x: from.x + (dx / distance) * radius, y: from.y + (dy / distance) * radius };
}

/** Id znacznika SVG z id krawędzi (`lease:12`) — tylko znaki bezpieczne w `url(#…)`. */
function markerIdOf(edgeId: string): string {
  return `graph-arrow-${edgeId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * Krawędź „pływająca”: prosta linia od brzegu do brzegu okręgów (przycięta promieniem węzła),
 * ze strzałką od osoby do repozytorium (od zespołu do osoby dla członkostwa).
 *
 * Kolor niesie klasa stanu z `getStatusBadge` na `<g>` krawędzi (ustawia ją `PermissionsGraph`),
 * a ścieżka i grot rysują `currentColor` — dlatego znacznik siedzi we własnym `<defs>` krawędzi:
 * znacznik SVG dziedziczy kolor po swoich przodkach, nie po ścieżce, która go używa.
 *
 * Podświetlona krawędź płynie przerywaną kreską od źródła do celu (`dashdraw` z arkusza React
 * Flow) i pokazuje etykietę roli **wzdłuż** linii (jak w Neo4j Browser): krawędzie rozchodzące się
 * promieniście z jednej osoby nie zderzają się wtedy etykietami. Na odcinku krótszym niż etykieta
 * jej nie rysujemy — rola zostaje w panelu szczegółów i w `aria-label` krawędzi.
 * `prefers-reduced-motion` gasi animację globalnie (`index.css`).
 */
export function FloatingEdge({
  id,
  source,
  target,
  data,
}: EdgeProps<FloatingFlowEdge>): React.JSX.Element | null {
  const sourceNode: InternalNode | undefined = useInternalNode(source);
  const targetNode: InternalNode | undefined = useInternalNode(target);

  if (sourceNode === undefined || targetNode === undefined || data === undefined) {
    return null;
  }

  const from = circleOf(sourceNode);
  const to = circleOf(targetNode);
  const start: XYPosition = pointOnRim(from.centre, from.radius, to.centre);
  const end: XYPosition = pointOnRim(to.centre, to.radius + ARROW_GAP, from.centre);
  const [path, labelX, labelY] = getStraightPath({
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
  });

  const baseWidth: number = data.role === null ? MEMBERSHIP_WIDTH : ROLE_WIDTH[data.role];
  const width: number = baseWidth * EMPHASIS_WIDTH[data.emphasis];
  const active: boolean = data.emphasis === 'active';
  const markerId: string = markerIdOf(id);
  const roleLabel: string | null = data.role === null ? null : getRoleLabel(data.role);
  const showLabel: boolean =
    active &&
    roleLabel !== null &&
    labelFits(Math.hypot(end.x - start.x, end.y - start.y), roleLabel);

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerHeight={8}
          markerUnits="userSpaceOnUse"
          markerWidth={8}
          orient="auto"
          refX={8}
          refY={4}
          viewBox="0 0 8 8"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
        </marker>
      </defs>
      <path
        className="react-flow__edge-path transition-[opacity,stroke-width] duration-300 ease-out-quiet"
        d={path}
        fill="none"
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: 'currentColor',
          strokeWidth: width,
          opacity: EMPHASIS_OPACITY[data.emphasis],
          strokeDasharray: active ? '6 4' : data.kind === 'membership' ? '2 3' : undefined,
          animation: active ? 'dashdraw 0.6s linear infinite' : undefined,
        }}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-sm border border-border bg-popover px-1 py-px text-xs leading-none whitespace-nowrap text-popover-foreground shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) rotate(${readableAngle(start, end)}deg)`,
            }}
          >
            {roleLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
