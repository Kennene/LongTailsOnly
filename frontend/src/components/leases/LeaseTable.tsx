import type { ReactNode } from 'react';

import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { RecommendationBadge } from '@/components/leases/RecommendationBadge';
import { RoleBadge } from '@/components/leases/RoleBadge';
import { TeamChip } from '@/components/leases/TeamChip';
import { UserAvatar } from '@/components/leases/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTimeShortPl, formatDaysRemaining } from '@/lib/dateTime';
import { initialsFrom } from '@/lib/userInitials';
import { cn } from '@/lib/utils';
import type { LeaseOverview, LeaseStatus } from '@/types/api';

export interface LeaseTableProps {
  leases: LeaseOverview[];
  onDecide?: (lease: LeaseOverview) => void;
}

/** Ranga pilności (spec §7.2): wygasłe, ostrzeżenia, aktywne, a za nimi stałe (admin) i odebrane. */
const STATUS_RANK: Record<LeaseStatus, number> = {
  EXPIRED: 0,
  WARNING: 1,
  ACTIVE: 2,
  PERMANENT: 3,
  REVOKED: 4,
};

/**
 * Szerokości kolumn tożsamości — rezerwacja **i** sufit naraz. W `table-layout: auto` samo
 * `max-w-*` jest wyłącznie sufitem i niczego nie rezerwuje (kolumna zwijała się do ~108 px,
 * a `Ostatnia aktywność` rosła do ~234 px, spychając `Status`, `Rekomendację` i akcję wiersza
 * poza ekran), natomiast samo `w-*` nie trzyma kolumny, gdy treść jest szersza od rezerwacji.
 * Wartości zmierzone w Chromium (`text-sm`, 1024–1920 px): `w-60 max-w-60` = 240 px mieści
 * najdłuższą tożsamość i pełne `owner/repo` w `font-mono` (`longtails/legacy-reports` = 210 px),
 * `w-16 max-w-16` = 64 px mieści nazwy zespołów (`DEV`, `QA`) oraz myślnik dla braku wartości.
 * Po przejściu na wspólne fixture'y sprawdzone ponownie (1440 px, `shared/fixtures`): 15 wierszy,
 * najdłuższa tożsamość „Tomasz (IT Security)” + „tomasz-admin”, zero przyciętych komórek i zero
 * poziomego przewijania tabeli. Sufit zostaje na wypadek dłuższych danych z backendu — wtedy
 * komórka się ucina, zamiast rozsadzać całą tabelę.
 */
const COLUMN_WIDTH = {
  user: 'w-60 max-w-60',
  team: 'w-16 max-w-16',
  repository: 'w-60 max-w-60',
} as const;

/**
 * Kolumny drugiego planu — poniżej `2xl` (1536 px) schodzą z drogi kolumnom decyzyjnym
 * (`Status`, `Rekomendacja`, `Akcje`) zamiast je wypychać poza ekran.
 *
 * Próg jest **wymierzony, nie intuicyjny**: przy 1440 px kontener ma 1152 px, a komplet dziewięciu
 * kolumn bez ucinania tekstu potrzebuje 1258 px (`table-layout: auto` bierze `max-content` komórek),
 * więc `xl` zostawiałoby 108 px poziomego przewijania i wciskało `Rekomendację` pod przyklejoną
 * kolumnę akcji. Siedem kolumn, które zostają, to dokładnie to, o co produkt się rozchodzi
 * (tożsamość, repozytorium, termin, status, rekomendacja, akcja) i mieści się bez ucinania —
 * 56 px zapasu; `Zespół` i `Poziom` wracają w pełnym składzie od 1536 px. Nie „poprawiaj” tego
 * z powrotem na `xl`: ciasny zakres 1536–1560 px (kontener 1248 px < 1258 px treści) jest tańszy
 * niż urwany login i `owner/repo`.
 *
 * `table-cell`, a nie `block`, bo przywracamy natywny display komórki tabeli; ta sama klasa idzie
 * na nagłówek i na komórkę, żeby wiersze pozostały wyrównane.
 */
const SECONDARY_COLUMN = 'hidden 2xl:table-cell';

/**
 * Ostatnia kolumna (nagłówek `Akcje` + przycisk `Decyzja`) jedzie przyklejona do prawej krawędzi
 * kontenera, więc akcja wiersza jest w zasięgu przy każdej szerokości. Tło musi być nieprzezroczyste
 * i równe powierzchni, na której leży wiersz — zmierzone `getComputedStyle`: `tr`, `table` i zwykłe
 * komórki są przezroczyste, a widocznym tłem jest `--background` (`body`), nie `--card`; inaczej
 * przewijane kolumny przeświecają pod przyciskiem. Obramowanie z lewej (kolor z `border-border`)
 * oddziela przyklejoną kolumnę od przewijanej treści.
 */
const ACTION_COLUMN = 'sticky right-0 border-l bg-background text-right';

export function LeaseTable({ leases, onDecide }: LeaseTableProps): React.JSX.Element {
  if (leases.length === 0) {
    return <p className="text-sm text-muted-foreground">Brak dostępów do wyświetlenia</p>;
  }

  const rows: LeaseOverview[] = leases.toSorted(compareLeases);

  return (
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
        {rows.map((lease: LeaseOverview): React.JSX.Element => {
          const repositoryFullName: string = `${lease.repository.owner}/${lease.repository.name}`;

          return (
            <TableRow key={lease.id} className="group">
              <TableCell className={COLUMN_WIDTH.user}>
                {/* Jedna linia: nazwa, login i awatar obok siebie. Stos `div` + `div` dawał 2–3 linie,
                    czyli wiersze 57–77 px zamiast pasma 36–40 px (DESIGN.md §3). Awatar jedzie na
                    końcu komórki: nazwa jest sygnałem, inicjały tylko go potwierdzają, więc nie
                    zabierają pierwszego miejsca w wierszu. */}
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 font-medium">{lease.user.name}</span>
                  <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {lease.user.login}
                  </span>
                  <UserAvatar initials={initialsFrom(lease.user)} login={lease.user.login} />
                </div>
              </TableCell>
              <TableCell className={cn(COLUMN_WIDTH.team, SECONDARY_COLUMN)}>
                {lease.user.team === null ? '—' : <TeamChip label={lease.user.team.name} />}
              </TableCell>
              <TableCell className={cn(COLUMN_WIDTH.repository, 'font-mono')}>
                <span className="block truncate">{repositoryFullName}</span>
              </TableCell>
              <TableCell className={SECONDARY_COLUMN}>
                <RoleBadge role={lease.current_role} />
              </TableCell>
              <TableCell className="font-mono">
                {lease.last_activity_at === null
                  ? '—'
                  : formatDateTimeShortPl(lease.last_activity_at)}
              </TableCell>
              <TableCell>{formatDaysRemaining(lease.days_remaining)}</TableCell>
              <TableCell>
                <LeaseStatusBadge status={lease.status} />
              </TableCell>
              <TableCell>
                <RecommendationBadge recommendation={lease.recommendation} />
              </TableCell>
              {/* `py-1` zamiast `p-2`: przycisk `sm` ma 28 px i przy `p-2` rozdymał wiersz do
                  45 px. Wiersz zostaje w pasmie gęstości 36–40 px (DESIGN.md §3), zmierzone 38 px. */}
              {onDecide === undefined ? null : (
                <TableCell className={cn(ACTION_COLUMN, 'py-1')}>
                  {/* Tło komórki jest nieprzezroczyste (żeby treść nie przeświecała przy przewijaniu),
                      więc własne tło zasłania hover wiersza. Nakładka odtwarza go dokładnie jedną
                      warstwą `muted/50` na `background` — to ta sama wartość, co `hover:bg-muted/50`
                      wiersza, bez podwójnego złożenia (zmierzone rgb(23, 26, 30) w dark). */}
                  <span className="absolute inset-0 transition-colors group-hover:bg-muted/50" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="relative"
                    onClick={() => onDecide(lease)}
                  >
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
 * a dostępy bez terminu (`days_remaining: null`, czyli rola `admin`) na końcu.
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
