import { ExpandToggle } from '@/components/common/ExpandToggle';
import { CELL_CENTER, ColumnCaption } from '@/components/common/TableCells';
import type { LeaseGroup } from '@/components/leases/leaseGroups';
import {
  countPendingRecommendations,
  formatRepositoryCount,
  latestActivityAt,
} from '@/components/leases/leaseGroups';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import {
  ACTION_COLUMN,
  COLUMN_WIDTH,
  SECONDARY_COLUMN,
} from '@/components/leases/leaseTableLayout';
import { RecommendationBadge } from '@/components/leases/RecommendationBadge';
import { RoleBadge } from '@/components/leases/RoleBadge';
import { TeamChip } from '@/components/leases/TeamChip';
import { UserAvatar } from '@/components/leases/UserAvatar';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatDateTimeShortPl, formatDaysRemaining } from '@/lib/dateTime';
import { initialsFrom } from '@/lib/userInitials';
import { cn } from '@/lib/utils';
import type { LeaseOverview } from '@/types/api';

export interface LeaseGroupRowsProps {
  group: LeaseGroup;
  expanded: boolean;
  onToggle: () => void;
  onDecide?: (lease: LeaseOverview) => void;
}

/** Wiersz osoby i — po rozwinięciu — po jednym wierszu na każde jej repozytorium. */
export function LeaseGroupRows({
  group,
  expanded,
  onToggle,
  onDecide,
}: LeaseGroupRowsProps): React.JSX.Element {
  return (
    <>
      <GroupRow
        group={group}
        expanded={expanded}
        onToggle={onToggle}
        withActions={onDecide !== undefined}
      />
      {expanded
        ? group.leases.map((lease: LeaseOverview): React.JSX.Element => (
            <LeaseRow key={lease.id} lease={lease} onDecide={onDecide} />
          ))
        : null}
    </>
  );
}

interface GroupRowProps {
  group: LeaseGroup;
  expanded: boolean;
  onToggle: () => void;
  withActions: boolean;
}

/**
 * Podsumowanie osoby: kim jest, ile ma repozytoriów i jak pilny jest jej najgorszy dostęp.
 * Termin pochodzi z **najpilniejszego** dostępu, bo to on decyduje, czy admin ma tu zajrzeć;
 * aktywność to najświeższa z wszystkich repozytoriów osoby. Statusu wiersz osoby nie pokazuje.
 */
function GroupRow({ group, expanded, onToggle, withActions }: GroupRowProps): React.JSX.Element {
  const pending: number = countPendingRecommendations(group.leases);
  const lastActivity: string | null = latestActivityAt(group.leases);

  return (
    <TableRow className="cursor-pointer" onClick={onToggle}>
      <TableCell className={COLUMN_WIDTH.user}>
        {/* Jedna linia: strzałka, nazwa i awatar (pasmo 36–40 px, DESIGN.md §3). Klik w cały
            wiersz też rozwija, ale stan niesie przycisk z `aria-expanded`, nie kolor ani kursor. */}
        <div className="flex items-center gap-1.5">
          <ExpandToggle
            expanded={expanded}
            onToggle={onToggle}
            subject="dostępy"
            owner={group.user.name}
          />
          <span className="min-w-0 truncate font-medium">{group.user.name}</span>
          <UserAvatar initials={initialsFrom(group.user)} login={group.user.login} />
        </div>
      </TableCell>
      <TableCell className={cn(COLUMN_WIDTH.team, SECONDARY_COLUMN, CELL_CENTER)}>
        {group.user.team === null ? '—' : <TeamChip label={group.user.team.name} />}
      </TableCell>
      <TableCell className={cn(COLUMN_WIDTH.repository, CELL_CENTER, 'text-muted-foreground')}>
        {formatRepositoryCount(group.leases.length)}
      </TableCell>
      <TableCell className={cn(SECONDARY_COLUMN, CELL_CENTER)}>
        {expanded ? <ColumnCaption>Poziom</ColumnCaption> : null}
      </TableCell>
      <TableCell className={cn(CELL_CENTER, 'font-mono')}>
        {lastActivity === null ? '—' : formatDateTimeShortPl(lastActivity)}
      </TableCell>
      <TableCell className={CELL_CENTER}>
        {formatDaysRemaining(group.mostUrgent.days_remaining)}
      </TableCell>
      {/* Status należy do dostępu, nie do osoby — pokazują go dopiero wiersze repozytoriów,
          a wiersz osoby po rozwinięciu podpisuje tylko kolumnę nad nimi. */}
      <TableCell className={CELL_CENTER}>
        {expanded ? <ColumnCaption>Status</ColumnCaption> : null}
      </TableCell>
      <TableCell className={cn(CELL_CENTER, 'text-muted-foreground')}>
        {pending === 0 ? '—' : `${pending} do decyzji`}
      </TableCell>
      {withActions ? (
        <TableCell className={ACTION_COLUMN}>
          {expanded ? <ColumnCaption>Akcje</ColumnCaption> : null}
        </TableCell>
      ) : null}
    </TableRow>
  );
}

interface LeaseRowProps {
  lease: LeaseOverview;
  onDecide?: (lease: LeaseOverview) => void;
}

/** Jedno repozytorium osoby — szczegóły i akcja `Decyzja`. Tożsamość niesie wiersz osoby wyżej. */
function LeaseRow({ lease, onDecide }: LeaseRowProps): React.JSX.Element {
  return (
    <TableRow className="group bg-muted/20" data-lease-id={lease.id}>
      <TableCell className={COLUMN_WIDTH.user} />
      <TableCell className={cn(COLUMN_WIDTH.team, SECONDARY_COLUMN, CELL_CENTER)} />
      <TableCell className={cn(COLUMN_WIDTH.repository, CELL_CENTER, 'font-mono')}>
        <span className="block truncate">{`${lease.repository.owner}/${lease.repository.name}`}</span>
      </TableCell>
      <TableCell className={cn(SECONDARY_COLUMN, CELL_CENTER)}>
        <RoleBadge role={lease.current_role} />
      </TableCell>
      <TableCell className={cn(CELL_CENTER, 'font-mono')}>
        {lease.last_activity_at === null ? '—' : formatDateTimeShortPl(lease.last_activity_at)}
      </TableCell>
      <TableCell className={CELL_CENTER}>{formatDaysRemaining(lease.days_remaining)}</TableCell>
      <TableCell className={CELL_CENTER}>
        <LeaseStatusBadge status={lease.status} />
      </TableCell>
      <TableCell className={CELL_CENTER}>
        <RecommendationBadge recommendation={lease.recommendation} />
      </TableCell>
      {/* `py-1` zamiast `p-2`: przycisk `sm` ma 28 px i przy `p-2` rozdymał wiersz do 45 px.
          Wiersz zostaje w pasmie gęstości 36–40 px (DESIGN.md §3). */}
      {onDecide === undefined ? null : (
        <TableCell className={cn(ACTION_COLUMN, 'py-1')}>
          {/* Tło komórki jest nieprzezroczyste, więc własne tło zasłania hover wiersza. Nakładka
              odtwarza go jedną warstwą `muted/50` na `background`, bez podwójnego złożenia. */}
          <span className="absolute inset-0 transition-colors group-hover:bg-muted/50" />
          <Button variant="outline" size="sm" className="relative" onClick={() => onDecide(lease)}>
            Decyzja
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
