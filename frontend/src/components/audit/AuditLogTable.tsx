import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTimePl } from '@/lib/dateTime';
import { cn } from '@/lib/utils';
import type { AuditEntry } from '@/types/api';

export interface AuditLogTableProps {
  entries: AuditEntry[];
}

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

const SKELETON_ROWS: number[] = [0, 1, 2, 3];

/**
 * Dziennik zdarzeń (spec §7.7): czas, aktor, akcja, cel i uzasadnienie. `details` pokazujemy jako
 * zwięzły podgląd obok akcji, a nie surowy JSON — administrator skanuje dziesiątki wierszy.
 */
export function AuditLogTable({ entries }: AuditLogTableProps): React.JSX.Element {
  return (
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
        {entries.map((entry: AuditEntry): React.JSX.Element => {
          const detailsPreview: string = formatDetails(entry.details);

          return (
            <TableRow key={entry.id}>
              <TableCell className="font-mono whitespace-nowrap">
                {formatDateTimePl(entry.timestamp)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {/* Typ i tożsamość w jednej linii — stos dwóch `div`-ów rozdymał wiersz. */}
                {entry.actor_type}{' '}
                <span className="font-mono text-xs text-muted-foreground">
                  {formatActorIdentity(entry)}
                </span>
              </TableCell>
              <TableCell className={cn(COLUMN_WIDTH.action, 'break-words whitespace-normal')}>
                <div className="font-mono">{entry.action}</div>
                {detailsPreview.length === 0 ? null : (
                  <div className="text-xs break-words text-muted-foreground">{detailsPreview}</div>
                )}
              </TableCell>
              <TableCell
                className={cn(COLUMN_WIDTH.target, 'font-mono break-words whitespace-normal')}
              >
                {entry.target}
              </TableCell>
              <TableCell
                className={cn(COLUMN_WIDTH.justification, 'break-words whitespace-normal')}
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
        })}
      </TableBody>
    </Table>
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

/**
 * Tożsamość aktora: backend rozwiązuje `actor_login` (LEFT JOIN z `users`), więc pokazujemy login,
 * a nie `#id`. Wpis SYSTEM nie ma człowieka — zostaje sam typ i kreska, nigdy pusta komórka.
 */
function formatActorIdentity(entry: AuditEntry): string {
  if (entry.actor_login !== null) {
    return entry.actor_login;
  }

  return entry.actor_id === null ? '—' : `#${entry.actor_id}`;
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

interface HeadCellProps {
  children: ReactNode;
}

function HeadCell({ children }: HeadCellProps): React.JSX.Element {
  return <TableHead className="text-muted-foreground">{children}</TableHead>;
}
