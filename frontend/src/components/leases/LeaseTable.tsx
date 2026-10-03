import type { ReactNode } from 'react';
import { useState } from 'react';

import { LeaseGroupRows } from '@/components/leases/LeaseGroupRows';
import type { LeaseGroup } from '@/components/leases/leaseGroups';
import { groupLeasesByUser } from '@/components/leases/leaseGroups';
import { ACTION_COLUMN, SECONDARY_COLUMN } from '@/components/leases/leaseTableLayout';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { LeaseOverview } from '@/types/api';

export interface LeaseTableProps {
  leases: LeaseOverview[];
  onDecide?: (lease: LeaseOverview) => void;
}

/**
 * Inwentarz dostępów pogrupowany po osobie: każda osoba to jeden wiersz (bez powtarzania
 * „Kamil” przy każdym repozytorium), a jej repozytoria rozwijają się pod nim. Osoby idą po
 * pilności najgorszego dostępu (wygasłe → ostrzeżenia → aktywne → stałe → odebrane), więc
 * to, co wymaga decyzji, nadal jest na górze — tylko zwinięte.
 */
export function LeaseTable({ leases, onDecide }: LeaseTableProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

  if (leases.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak dostępów do wyświetlenia</p>;
  }

  const groups: LeaseGroup[] = groupLeasesByUser(leases);
  const allExpanded: boolean = groups.every((group: LeaseGroup): boolean =>
    expanded.has(group.user.id),
  );

  function toggle(userId: number): void {
    const next: Set<number> = new Set(expanded);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setExpanded(next);
  }

  function toggleAll(): void {
    setExpanded(
      allExpanded ? new Set() : new Set(groups.map((group: LeaseGroup): number => group.user.id)),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {allExpanded ? 'Zwiń wszystkie' : 'Rozwiń wszystkie'}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <HeadCell>Użytkownik</HeadCell>
            <HeadCell className={SECONDARY_COLUMN}>Zespół</HeadCell>
            <HeadCell>Repozytorium</HeadCell>
            <HeadCell className={SECONDARY_COLUMN}>Poziom</HeadCell>
            <HeadCell>Ostatnia aktywność</HeadCell>
            <HeadCell>Pozostało</HeadCell>
            <HeadCell>Status</HeadCell>
            <HeadCell>Rekomendacja</HeadCell>
            {onDecide === undefined ? null : <HeadCell className={ACTION_COLUMN}>Akcje</HeadCell>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group: LeaseGroup): React.JSX.Element => (
            <LeaseGroupRows
              key={group.user.id}
              group={group}
              expanded={expanded.has(group.user.id)}
              onToggle={() => toggle(group.user.id)}
              onDecide={onDecide}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface HeadCellProps {
  children: ReactNode;
  className?: string;
}

function HeadCell({ children, className }: HeadCellProps): React.JSX.Element {
  return <TableHead className={cn('text-muted-foreground', className)}>{children}</TableHead>;
}
