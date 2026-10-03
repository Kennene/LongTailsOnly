import { ExpandAllButton, ExpandToggle } from '@/components/common/ExpandToggle';
import type { LeaseGroup } from '@/components/leases/leaseGroups';
import { formatRepositoryCount, groupLeasesByUser } from '@/components/leases/leaseGroups';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type ExpandedSet, useExpandedSet } from '@/hooks/useExpandedSet';
import { formatDaysRemaining } from '@/lib/dateTime';
import { getRoleLabel } from '@/lib/statusBadges';
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
            <TableHead>Osoba</TableHead>
            <TableHead>Repozytorium</TableHead>
            <TableHead>Poziom</TableHead>
            <TableHead>Pozostało</TableHead>
            <TableHead>Status</TableHead>
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
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatRepositoryCount(group.leases.length)}
        </TableCell>
        <TableCell />
        <TableCell>{formatDaysRemaining(group.mostUrgent.days_remaining)}</TableCell>
        {/* Status należy do dostępu, nie do osoby — pokazują go dopiero wiersze repozytoriów. */}
        <TableCell />
      </TableRow>
      {expanded
        ? group.leases.map((lease: LeaseOverview): React.JSX.Element => (
            <TableRow key={lease.id} className="bg-muted/20">
              <TableCell />
              <TableCell className="font-mono text-xs">{lease.repository.name}</TableCell>
              <TableCell>{getRoleLabel(lease.current_role)}</TableCell>
              <TableCell>{formatDaysRemaining(lease.days_remaining)}</TableCell>
              <TableCell>
                <LeaseStatusBadge status={lease.status} />
              </TableCell>
            </TableRow>
          ))
        : null}
    </>
  );
}
