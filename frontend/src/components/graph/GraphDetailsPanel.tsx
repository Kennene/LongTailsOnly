import { X } from 'lucide-react';

import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { RecommendationBadge } from '@/components/leases/RecommendationBadge';
import { RoleBadge } from '@/components/leases/RoleBadge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { type AccessRow, accessRowsOf, isElevatedRisk } from '@/lib/graphHighlight';
import type { GraphEdge, GraphNode } from '@/types/api';

export interface GraphDetailsPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  /** Zamyka panel, czyszcząc zaznaczenie (to samo co Escape albo klik w tło grafu). */
  onClose: () => void;
}

const TYPE_LABEL: Record<GraphNode['type'], string> = {
  team: 'Zespół',
  user: 'Osoba',
  repo: 'Repozytorium',
};

/** Odmiana „ostrzeżenie” po liczebniku (1 / 2–4 / 5+, z wyjątkiem 12–14). */
function warningsWord(count: number): string {
  if (count === 1) {
    return 'ostrzeżenie';
  }

  const lastDigit: number = count % 10;
  const lastTwo: number = count % 100;

  return lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)
    ? 'ostrzeżenia'
    : 'ostrzeżeń';
}

/** Podsumowanie nad listą: ile relacji i ile z nich to podwyższone ryzyko (`WARNING`/`EXPIRED`). */
function summaryOf(type: GraphNode['type'], rows: AccessRow[]): string {
  const risky: number = rows.filter((row: AccessRow): boolean => isElevatedRisk(row.status)).length;
  const warnings = `w tym ${risky} ${warningsWord(risky)}`;

  if (type === 'user') {
    return `${rows.length} repo, ${warnings}`;
  }
  if (type === 'repo') {
    return `Osoby z dostępem: ${rows.length}, ${warnings}`;
  }

  return `Członkowie: ${rows.length}, ${warnings}`;
}

function AccessRowItem({
  row,
  onSelect,
}: {
  row: AccessRow;
  onSelect: (nodeId: string) => void;
}): React.JSX.Element {
  return (
    <li className="flex flex-col gap-1.5 border-b border-border py-2 last:border-b-0">
      <button
        className="self-start truncate rounded-md font-mono text-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={(): void => onSelect(row.id)}
        type="button"
      >
        {row.label}
      </button>
      <div className="flex flex-wrap gap-1">
        {row.status === null ? null : <LeaseStatusBadge status={row.status} />}
        {row.role === null ? null : <RoleBadge role={row.role} />}
        {row.recommendation === null ? null : (
          <RecommendationBadge recommendation={row.recommendation} />
        )}
      </div>
    </li>
  );
}

/**
 * Panel szczegółów grafu: drogi dostępu zaznaczonego węzła, od najwyższego ryzyka. Osoba widzi swoje
 * repozytoria, repozytorium — osoby z dostępem, zespół — członków z najgorszym statusem.
 * Etykiety i kolory pochodzą z gotowych odznak (`statusBadges.ts`), a kliknięcie w wiersz
 * przenosi zaznaczenie na drugi koniec relacji. Bez zaznaczenia panel się nie renderuje — graf
 * dostaje wtedy całą szerokość.
 */
export function GraphDetailsPanel({
  nodes,
  edges,
  selectedId,
  onSelect,
  onClose,
}: GraphDetailsPanelProps): React.JSX.Element | null {
  const selected: GraphNode | undefined = nodes.find(
    (node: GraphNode): boolean => node.id === selectedId,
  );

  if (selected === undefined) {
    return null;
  }

  const rows: AccessRow[] = accessRowsOf(nodes, edges, selected.id);

  return (
    <Card
      aria-label={`Szczegóły: ${selected.data.label}`}
      className="shadow-lg"
      role="region"
      size="sm"
    >
      <CardHeader>
        <CardAction>
          <Button aria-label="Zamknij szczegóły" onClick={onClose} size="icon-sm" variant="ghost">
            <X aria-hidden />
          </Button>
        </CardAction>
        <CardDescription className="text-xs">{TYPE_LABEL[selected.type]}</CardDescription>
        <CardTitle className="font-mono">{selected.data.label}</CardTitle>
        <CardDescription>{summaryOf(selected.type, rows)}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak czynnych dostępów.</p>
        ) : (
          <ul className="max-h-[min(26rem,50dvh)] overflow-y-auto pr-1">
            {rows.map((row: AccessRow): React.JSX.Element => (
              <AccessRowItem key={row.id} onSelect={onSelect} row={row} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
