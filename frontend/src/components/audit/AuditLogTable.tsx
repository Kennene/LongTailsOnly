import type { ReactNode } from 'react';

import { AuditGroupRows } from '@/components/audit/AuditGroupRows';
import type { AuditGroup } from '@/components/audit/auditGroups';
import { groupAuditByActor } from '@/components/audit/auditGroups';
import { ExpandAllButton } from '@/components/common/ExpandToggle';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type ExpandedSet, useExpandedSet } from '@/hooks/useExpandedSet';
import type { AuditEntry } from '@/types/api';

export interface AuditLogTableProps {
  entries: AuditEntry[];
}

const SKELETON_ROWS: number[] = [0, 1, 2, 3];

/**
 * Dziennik zdarzeń (spec §7.7): czas, aktor, akcja, cel i uzasadnienie — pogrupowany po aktorze.
 * Każdy aktor (login, a SYSTEM jako całość) to jeden wiersz z liczbą wpisów i czasem ostatniego;
 * jego zdarzenia rozwijają się pod nim. Aktorzy idą od najświeższej aktywności.
 */
export function AuditLogTable({ entries }: AuditLogTableProps): React.JSX.Element {
  const expanded: ExpandedSet<string> = useExpandedSet<string>();
  const groups: AuditGroup[] = groupAuditByActor(entries);
  const keys: string[] = groups.map((group: AuditGroup): string => group.key);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <ExpandAllButton
          allExpanded={expanded.areAllExpanded(keys)}
          onToggleAll={() => expanded.toggleAll(keys)}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <HeadCell>Czas</HeadCell>
            <HeadCell>Aktor</HeadCell>
            <HeadCell>Akcja</HeadCell>
            <HeadCell>Cel</HeadCell>
            <HeadCell>Uzasadnienie</HeadCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group: AuditGroup): React.JSX.Element => (
            <AuditGroupRows
              key={group.key}
              group={group}
              expanded={expanded.isExpanded(group.key)}
              onToggle={() => expanded.toggle(group.key)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Szkielet w układzie docelowym tabeli — widok nigdy nie pokazuje spinnera w środku treści. */
export function AuditLogTableSkeleton(): React.JSX.Element {
  return (
    <div role="status" className="flex flex-col gap-2">
      <span className="sr-only">Wczytywanie dziennika audytu…</span>
      <Skeleton aria-hidden className="h-10 w-full" />
      {SKELETON_ROWS.map((row: number): React.JSX.Element => (
        <Skeleton key={row} aria-hidden className="h-9 w-full" />
      ))}
    </div>
  );
}

interface HeadCellProps {
  children: ReactNode;
}

function HeadCell({ children }: HeadCellProps): React.JSX.Element {
  return <TableHead className="text-muted-foreground">{children}</TableHead>;
}
