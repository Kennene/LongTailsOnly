import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { RoleBadge } from '@/components/leases/RoleBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDaysRemaining } from '@/lib/dateTime';
import type { LeaseOverview } from '@/types/api';

export interface LeaseCandidatesTableProps {
  leases: LeaseOverview[];
}

/**
 * Dostępy, które silnik przyjmie do odwołania: odebrane oraz `WARNING`/`EXPIRED` (`is_appealable`).
 * Status i poziom składają te same pigułki co tabela `/leases`, więc oba widoki mówią jednym
 * językiem (DESIGN.md §4).
 */
export function LeaseCandidatesTable({ leases }: LeaseCandidatesTableProps): React.JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-muted-foreground">Osoba</TableHead>
          <TableHead className="text-muted-foreground">Repozytorium</TableHead>
          <TableHead className="text-muted-foreground">Poziom</TableHead>
          <TableHead className="text-muted-foreground">Pozostało</TableHead>
          <TableHead className="text-muted-foreground">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leases.map((lease: LeaseOverview): React.JSX.Element => (
          <TableRow key={lease.id}>
            <TableCell className="font-medium">{lease.user.name}</TableCell>
            <TableCell className="font-mono">{lease.repository.name}</TableCell>
            <TableCell>
              <RoleBadge role={lease.current_role} />
            </TableCell>
            <TableCell>{formatDaysRemaining(lease.days_remaining)}</TableCell>
            <TableCell>
              <LeaseStatusBadge status={lease.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
