import type { AuditGroup } from '@/components/audit/auditGroups';
import { ExpandToggle } from '@/components/common/ExpandToggle';
import { CELL_CENTER, ColumnCaption } from '@/components/common/TableCells';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatDateTimePl } from '@/lib/dateTime';
import { formatCountPl } from '@/lib/grouping';
import { cn } from '@/lib/utils';
import type { AuditEntry } from '@/types/api';

/**
 * Szerokości kolumn tekstowych — długie uzasadnienie i `target` nie rozsadzają tabeli.
 *
 * Uzasadnienie ma **zarezerwowaną** szerokość (`w-96`), a nie tylko zdjęty sufit (`max-w-96`):
 * przy `max-w-*` przeglądarka oddawała całe wolne miejsce pozostałym kolumnom i przy 1024 px
 * zostawiała uzasadnieniu ~10 znaków w linii (audyt, pomiar 417 px na wiersz).
 */
const COLUMN_WIDTH = {
  action: 'max-w-64',
  target: 'max-w-56',
  justification: 'w-96',
} as const;

/** Dwie linie prozy to sufit gęstości — pełny tekst zostaje w `title` (audyt, pomiar). */
const JUSTIFICATION_CLAMP = 'line-clamp-2';

export interface AuditGroupRowsProps {
  group: AuditGroup;
  expanded: boolean;
  onToggle: () => void;
}

/** Wiersz aktora i — po rozwinięciu — jego wpisy od najnowszego. */
export function AuditGroupRows({
  group,
  expanded,
  onToggle,
}: AuditGroupRowsProps): React.JSX.Element {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="whitespace-nowrap">
          {/* Typ i tożsamość w jednej linii — stos dwóch `div`-ów rozdymał wiersz. */}
          <ExpandToggle
            expanded={expanded}
            onToggle={onToggle}
            subject="wpisy"
            owner={group.owner}
          />{' '}
          {group.actorType}{' '}
          <span className="font-mono text-xs text-muted-foreground">{group.identity}</span>
        </TableCell>
        <TableCell className={cn(CELL_CENTER, 'font-mono whitespace-nowrap')}>
          {formatDateTimePl(group.latestAt)}
        </TableCell>
        <TableCell className={cn(CELL_CENTER, 'text-muted-foreground')}>
          {formatCountPl(group.entries.length, { one: 'wpis', few: 'wpisy', many: 'wpisów' })}
        </TableCell>
        <TableCell className={CELL_CENTER}>
          {expanded ? <ColumnCaption>Cel</ColumnCaption> : null}
        </TableCell>
        <TableCell className={CELL_CENTER}>
          {expanded ? <ColumnCaption>Uzasadnienie</ColumnCaption> : null}
        </TableCell>
      </TableRow>
      {expanded
        ? group.entries.map((entry: AuditEntry): React.JSX.Element => (
            <EntryRow key={entry.id} entry={entry} />
          ))
        : null}
    </>
  );
}

/** Jeden wpis: czas, akcja z podglądem `details`, cel i uzasadnienie. Aktora niesie wiersz wyżej. */
function EntryRow({ entry }: { entry: AuditEntry }): React.JSX.Element {
  const detailsPreview: string = formatDetails(entry.details);

  return (
    <TableRow className="bg-muted/20">
      <TableCell />
      <TableCell className={cn(CELL_CENTER, 'font-mono whitespace-nowrap')}>
        {formatDateTimePl(entry.timestamp)}
      </TableCell>
      <TableCell className={cn(COLUMN_WIDTH.action, CELL_CENTER, 'break-words whitespace-normal')}>
        <div className="font-mono">{entry.action}</div>
        {detailsPreview.length === 0 ? null : (
          <div className="text-xs break-words text-muted-foreground">{detailsPreview}</div>
        )}
      </TableCell>
      <TableCell
        className={cn(COLUMN_WIDTH.target, CELL_CENTER, 'font-mono break-words whitespace-normal')}
      >
        {entry.target}
      </TableCell>
      <TableCell
        className={cn(COLUMN_WIDTH.justification, CELL_CENTER, 'break-words whitespace-normal')}
      >
        {entry.justification === null ? (
          '—'
        ) : (
          // `title` daje pełny tekst bez dokładania JS-a; `line-clamp-2` trzyma wiersz
          // w dwóch liniach, więc tabela zachowuje gęstość 36–40 px (DESIGN.md §3).
          <div className={JUSTIFICATION_CLAMP} title={entry.justification}>
            {entry.justification}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

/** `{ days: 30, reason: 'activity' }` → `days: 30 · reason: activity`. */
function formatDetails(details: AuditEntry['details']): string {
  return Object.entries(details)
    .map(([key, value]: [string, unknown]): string => `${key}: ${formatDetailValue(value)}`)
    .join(' · ');
}

function formatDetailValue(value: unknown): string {
  if (value === null) {
    return '—';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
