import type { ReactNode } from 'react';

import { ExpandAllButton } from '@/components/common/ExpandToggle';
import { LeaseGroupRows } from '@/components/leases/LeaseGroupRows';
import type { LeaseGroup } from '@/components/leases/leaseGroups';
import { groupLeasesByUser } from '@/components/leases/leaseGroups';
import { ACTION_COLUMN, SECONDARY_COLUMN } from '@/components/leases/leaseTableLayout';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useExpandedSet } from '@/hooks/useExpandedSet';
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
  const expanded = useExpandedSet<number>();

  if (leases.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak dostępów do wyświetlenia</p>;
  }

  const groups: LeaseGroup[] = groupLeasesByUser(leases);
  const userIds: number[] = groups.map((group: LeaseGroup): number => group.user.id);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <ExpandAllButton
          allExpanded={expanded.areAllExpanded(userIds)}
          onToggleAll={() => expanded.toggleAll(userIds)}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <HeadCell>Użytkownik</HeadCell>
            <HeadCell className={SECONDARY_COLUMN}>Zespół</HeadCell>
            <HeadCell>Repozytorium</HeadCell>
            {/* „Poziom” i „Status” opisują dostęp, nie osobę: na ekranie stają w wierszu osoby
                dopiero po jej rozwinięciu, a nagłówek trzyma je tylko dla czytników ekranu. */}
            <HeadCell className={SECONDARY_COLUMN}>
              <span className="sr-only">Poziom</span>
            </HeadCell>
            <HeadCell>Ostatnia aktywność</HeadCell>
            <HeadCell>Pozostało</HeadCell>
            <HeadCell>
              <span className="sr-only">Status</span>
            </HeadCell>
            <HeadCell>Rekomendacja</HeadCell>
            {onDecide === undefined ? null : <HeadCell className={ACTION_COLUMN}>Akcje</HeadCell>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group: LeaseGroup): React.JSX.Element => (
            <LeaseGroupRows
              key={group.user.id}
              group={group}
              expanded={expanded.isExpanded(group.user.id)}
              onToggle={() => expanded.toggle(group.user.id)}
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
