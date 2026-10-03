import { getStatusBadge } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';
import type { GraphNode, LeaseStatus } from '@/types/api';

import { TYPE_FILL } from './graphFlow';

/** Legenda kolorów — te same rodziny stanów, których używa `getStatusBadge`. */
const LEGEND_STATUSES: readonly LeaseStatus[] = ['ACTIVE', 'WARNING', 'EXPIRED'];

const LEGEND_TYPES: readonly { type: GraphNode['type']; label: string; size: string }[] = [
  { type: 'team', label: 'Zespół', size: 'size-3.5' },
  { type: 'user', label: 'Osoba', size: 'size-3' },
  { type: 'repo', label: 'Repozytorium', size: 'size-2.5' },
];

/** Legenda pajęczyny: typ węzła (rozmiar + wypełnienie) i status dzierżawy (obrys, krawędź). */
export function GraphLegend(): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
      <ul aria-label="Typy węzłów" className="flex flex-wrap items-center gap-4">
        {LEGEND_TYPES.map(({ type, label, size }): React.JSX.Element => (
          <li key={type} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden
              className={cn('shrink-0 rounded-full border border-border', size, TYPE_FILL[type])}
            />
            {label}
          </li>
        ))}
      </ul>
      <ul aria-label="Statusy dzierżaw" className="flex flex-wrap items-center gap-4">
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
    </div>
  );
}
