import { ExpandAllButton, ExpandToggle } from '@/components/common/ExpandToggle';
import { CELL_CENTER, ColumnCaption, HeadCell } from '@/components/common/TableCells';
import { ExpiredCount, RemainingDays } from '@/components/common/TimeLabels';
import type { LeaseGroup } from '@/components/leases/leaseGroups';
import { formatRepositoryCount, groupLeasesByUser } from '@/components/leases/leaseGroups';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { RoleBadge } from '@/components/leases/RoleBadge';
import { UserAvatar } from '@/components/leases/UserAvatar';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { type ExpandedSet, useExpandedSet } from '@/hooks/useExpandedSet';
import { initialsFrom } from '@/lib/userInitials';
import { cn } from '@/lib/utils';
import type { LeaseOverview } from '@/types/api';

export interface AppealCandidatesTableProps {
  leases: LeaseOverview[];
}

/**
 * Dostępy, które silnik przyjmie do odwołania: odebrane oraz `WARNING`/`EXPIRED` (`is_appealable`).
 * Jak w tabeli dostępów — jeden wiersz na osobę (najpilniejszy dostęp), repozytoria po rozwinięciu.
 */
export function AppealCandidatesTable({ leases }: AppealCandidatesTableProps): React.JSX.Element {
  const expanded: ExpandedSet<number> = useExpandedSet<number>();
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
            <HeadCell leading>Użytkownik</HeadCell>
            <HeadCell>Repozytorium</HeadCell>
            {/* „Poziom” i „Status” opisują dostęp, nie osobę — jak w tabeli Dostępów. */}
            <HeadCell srOnly>Poziom</HeadCell>
            <HeadCell>Pozostało</HeadCell>
            <HeadCell srOnly>Status</HeadCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group: LeaseGroup): React.JSX.Element => (
            <CandidateGroupRows
              key={group.user.id}
              group={group}
              expanded={expanded.isExpanded(group.user.id)}
              onToggle={() => expanded.toggle(group.user.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface CandidateGroupRowsProps {
  group: LeaseGroup;
  expanded: boolean;
  onToggle: () => void;
}

function CandidateGroupRows({
  group,
  expanded,
  onToggle,
}: CandidateGroupRowsProps): React.JSX.Element {
  const expiredCount: number = group.leases.filter(
    (lease: LeaseOverview): boolean => lease.status === 'EXPIRED',
  ).length;

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <ExpandToggle
              expanded={expanded}
              onToggle={onToggle}
              subject="dostępy"
              owner={group.user.name}
            />
            <span className="font-medium">{group.user.name}</span>
            <UserAvatar initials={initialsFrom(group.user)} login={group.user.login} />
          </div>
        </TableCell>
        <TableCell className={cn(CELL_CENTER, 'text-muted-foreground')}>
          {formatRepositoryCount(group.leases.length)}
        </TableCell>
        <TableCell className={CELL_CENTER}>
          {expanded ? <ColumnCaption>Poziom</ColumnCaption> : null}
        </TableCell>
        <TableCell className={CELL_CENTER}>
          {expiredCount === 0 ? (
            <RemainingDays days={group.mostUrgent.days_remaining} expired={false} />
          ) : (
            <ExpiredCount count={expiredCount} />
          )}
        </TableCell>
        {/* Status należy do dostępu, nie do osoby — pokazują go dopiero wiersze repozytoriów. */}
        <TableCell className={CELL_CENTER}>
          {expanded ? <ColumnCaption>Status</ColumnCaption> : null}
        </TableCell>
      </TableRow>
      {expanded
        ? group.leases.map((lease: LeaseOverview): React.JSX.Element => (
            <TableRow key={lease.id} className="bg-muted/20">
              <TableCell />
              <TableCell className={cn(CELL_CENTER, 'font-mono')}>
                {`${lease.repository.owner}/${lease.repository.name}`}
              </TableCell>
              <TableCell className={CELL_CENTER}>
                <RoleBadge role={lease.current_role} />
              </TableCell>
              <TableCell className={CELL_CENTER}>
                <RemainingDays days={lease.days_remaining} expired={lease.status === 'EXPIRED'} />
              </TableCell>
              <TableCell className={CELL_CENTER}>
                <LeaseStatusBadge status={lease.status} />
              </TableCell>
            </TableRow>
          ))
        : null}
    </>
  );
}
