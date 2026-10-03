import { Handle, type NodeProps, Position } from '@xyflow/react';

import { GRAPH_NODE_RADIUS } from '@/lib/graphForceLayout';
import { getStatusBadge } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';
import type { GraphNode } from '@/types/api';

import { type CircleFlowNode, type Emphasis, TYPE_FILL } from './graphFlow';

/** Polski opis relacji w `aria-label` — bez odmiany liczebnika, więc stała forma po dwukropku. */
const RELATION_LABEL: Record<GraphNode['type'], string> = {
  team: 'członkowie',
  user: 'dostępy',
  repo: 'osoby z dostępem',
};

const EMPHASIS_OPACITY: Record<Emphasis, string> = {
  none: 'opacity-100',
  active: 'opacity-100',
  hovered: 'opacity-100',
  background: 'opacity-45',
  faded: 'opacity-15',
};

/**
 * Uchwyty są niewidoczne i siedzą w środku okręgu: krawędzie liczy `FloatingEdge` od brzegu do
 * brzegu, ale React Flow nie narysuje krawędzi bez zmierzonych uchwytów.
 */
const HANDLE_CLASSES = 'pointer-events-none !top-1/2 !left-1/2 opacity-0';

/**
 * Węzeł pajęczyny: okrąg z etykietą w środku (łamaną po myślnikach, maks. trzy linie, potem wielokropek; pełna nazwa
 * w `title`). Rozmiar i wypełnienie mówią o typie, obrys i kropka — o najgorszym statusie dostępów.
 *
 * Treść węzła to natywny `<button>`: Enter i spacja zaznaczają węzeł bez własnej obsługi klawiszy,
 * a `aria-pressed` mówi czytnikowi, który węzeł jest zaznaczony.
 */
export function GraphCircleNode({ id, data }: NodeProps<CircleFlowNode>): React.JSX.Element {
  const diameter: number = GRAPH_NODE_RADIUS[data.kind] * 2;
  const badge = data.status === null ? null : getStatusBadge(data.status);

  return (
    <div
      className={cn(
        // Nieprzezroczyste tło pod tintem typu: krawędzie nie prześwitują przez okrąg.
        'relative rounded-full bg-card transition-opacity duration-300 ease-out-quiet',
        EMPHASIS_OPACITY[data.emphasis],
      )}
      style={{ width: diameter, height: diameter }}
    >
      <Handle
        className={HANDLE_CLASSES}
        isConnectable={false}
        position={Position.Top}
        type="target"
      />
      <button
        aria-label={`${data.label} — ${RELATION_LABEL[data.kind]}: ${data.relations}${badge === null ? '' : `, ${badge.label}`}`}
        aria-pressed={data.selected}
        className={cn(
          'flex size-full cursor-pointer items-center justify-center rounded-full border-2 p-1 text-center shadow-sm outline-none',
          'transition-[box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50',
          // Klasy stanu z jedynej mapy; wypełnienie i tekst nadpisujemy, obrys zostaje ze statusu.
          badge === null ? 'border-border' : badge.className,
          TYPE_FILL[data.kind],
          'text-foreground',
          data.selected && 'ring-3 ring-primary',
        )}
        onClick={(): void => data.onSelect(id)}
        title={data.label}
        type="button"
      >
        <span
          className={cn(
            'line-clamp-3 font-mono text-xs leading-tight [overflow-wrap:anywhere]',
            data.kind === 'team' && 'font-sans font-semibold',
          )}
        >
          {data.label}
        </span>
      </button>
      {badge === null ? null : (
        <span
          aria-hidden
          className={cn(
            badge.className,
            'absolute top-0.5 right-0.5 size-3 rounded-full border-2 border-card bg-current',
          )}
        />
      )}
      <Handle
        className={HANDLE_CLASSES}
        isConnectable={false}
        position={Position.Bottom}
        type="source"
      />
    </div>
  );
}
