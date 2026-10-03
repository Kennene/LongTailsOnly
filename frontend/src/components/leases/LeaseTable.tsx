import type { ReactNode } from 'react';

import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { RecommendationBadge } from '@/components/leases/RecommendationBadge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTimePl, formatDaysRemaining } from '@/lib/dateTime';
import { getRecommendationLabel, getRoleLabel } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';
import type { LeaseOverview, LeaseStatus } from '@/types/api';

export interface LeaseTableProps {
  leases: LeaseOverview[];
  onDecide?: (lease: LeaseOverview) => void;
}

/** Ranga pilności (spec §7.2): wygasłe, potem ostrzeżenia, na końcu aktywne. */
const STATUS_RANK: Record<LeaseStatus, number> = { EXPIRED: 0, WARNING: 1, ACTIVE: 2 };

/**
 * Szerokości kolumn tekstowych. W `table-layout: auto` samo `max-w-*` jest tylko sufitem i niczego
 * nie rezerwuje — kolumna tożsamości zwijała się wtedy do ~108 px, a `Ostatnia aktywność` rosła do
 * ~234 px, spychając `Status`, `Rekomendację` i akcję wiersza poza ekran. Dlatego szerokości
 * rezerwujemy jawnie (`w-*`), a komórki zostają w jednej linii.
 */
const COLUMN_WIDTH = {
  user: 'w-44',
  team: 'w-16',
  repository: 'w-52',
} as const;

export function LeaseTable({ leases, onDecide }: LeaseTableProps): React.JSX.Element {
  if (leases.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak dzierżaw do wyświetlenia</p>;
  }

  const rows: LeaseOverview[] = leases.toSorted(compareLeases);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <HeadCell>Użytkownik</HeadCell>
          <HeadCell>Zespół</HeadCell>
          <HeadCell>Repozytorium</HeadCell>
          <HeadCell>Poziom</HeadCell>
          <HeadCell>Ostatnia aktywność</HeadCell>
          <HeadCell>Pozostało</HeadCell>
          <HeadCell>Status</HeadCell>
          <HeadCell>Rekomendacja</HeadCell>
          {onDecide === undefined ? null : <HeadCell className="text-right">Akcje</HeadCell>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((lease: LeaseOverview): React.JSX.Element => {
          const repositoryFullName: string = `${lease.repository.owner}/${lease.repository.name}`;

          return (
            <TableRow key={lease.id}>
              <TableCell className={COLUMN_WIDTH.user}>
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate font-medium">{lease.user.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {lease.user.login}
                  </span>
                </div>
              </TableCell>
              <TableCell className={COLUMN_WIDTH.team}>{lease.user.team?.name ?? '—'}</TableCell>
              <TableCell className={cn(COLUMN_WIDTH.repository, 'font-mono')}>
                {repositoryFullName}
              </TableCell>
              <TableCell>{getRoleLabel(lease.current_role)}</TableCell>
              <TableCell className="font-mono">
                {lease.last_activity_at === null ? '—' : formatDateTimePl(lease.last_activity_at)}
              </TableCell>
              <TableCell>{formatDaysRemaining(lease.days_remaining)}</TableCell>
              <TableCell>
                <LeaseStatusBadge status={lease.status} />
              </TableCell>
              <TableCell>
                <RecommendationBadge recommendation={lease.recommendation} />
              </TableCell>
              {onDecide === undefined ? null : (
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => onDecide(lease)}>
                    Decyzja
                  </Button>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Sortowanie z kontraktu: ranga statusu, w grupie rosnąco po `days_remaining`,
 * a dzierżawy bez terminu (`days_remaining: null`, czyli rola `admin`) na końcu.
 */
function compareLeases(left: LeaseOverview, right: LeaseOverview): number {
  const rank: number = STATUS_RANK[left.status] - STATUS_RANK[right.status];
  if (rank !== 0) {
    return rank;
  }
  if (left.days_remaining === null && right.days_remaining === null) {
    return 0;
  }
  if (left.days_remaining === null) {
    return 1;
  }
  if (right.days_remaining === null) {
    return -1;
  }

  return left.days_remaining - right.days_remaining;
}

interface HeadCellProps {
  children: ReactNode;
  className?: string;
}

function HeadCell({ children, className }: HeadCellProps): React.JSX.Element {
  return <TableHead className={cn('text-muted-foreground', className)}>{children}</TableHead>;
}
