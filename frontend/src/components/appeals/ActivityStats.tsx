import { useSimulatedNow } from '@/hooks/useSimulatedNow';
import { daysSince, formatDateTimePl, formatDaysAgo } from '@/lib/dateTime';
import type { LeaseActivityStats } from '@/types/api';

export interface ActivityStatsProps {
  stats: LeaseActivityStats;
}

/** Pola kontraktu, które panel pokazuje jako liczniki — `lease_id` ani okno nie są dowodem użycia. */
type ActivityCounterKey = 'push_count' | 'review_count' | 'comment_count';

interface ActivityCounter {
  key: ActivityCounterKey;
  label: string;
  testId: string;
}

/** Kolejność i etykiety liczników; `key` jest kluczem kontraktu 3.6, więc rozjazd nazw nie przejdzie. */
const ACTIVITY_COUNTERS: ActivityCounter[] = [
  { key: 'push_count', label: 'Push', testId: 'stat-push' },
  { key: 'review_count', label: 'Review', testId: 'stat-review' },
  { key: 'comment_count', label: 'Komentarze', testId: 'stat-comment' },
];

/**
 * Statystyki użycia dostępu (push / review / komentarze) w modalu decyzji — UC-3.
 *
 * Liczby i okno pochodzą wprost z `LeaseActivityStats`; frontend ich nie przelicza. Panel mówi
 * też, **w jakim oknie** je policzono i kiedy dostęp był ostatnio używany — bez tego trzy
 * liczby nie odpowiadają na pytanie, czy dowód użycia jest jeszcze aktualny. Kolorów stanu tu nie
 * ma (żadna z tych liczb nie jest statusem), więc liczniki zostają na tokenach neutralnych,
 * a liczba jest daną i idzie w `font-mono`.
 */
export function ActivityStats({ stats }: ActivityStatsProps): React.JSX.Element {
  const isEmptyWindow: boolean = stats.push_count + stats.review_count + stats.comment_count === 0;
  const now: string | null = useSimulatedNow();

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {/* Trzy równe kolumny: liczba nad etykietą — odstępy nie zależą od długości słów. */}
      <dl className="grid w-full max-w-md grid-cols-3 gap-x-6">
        {ACTIVITY_COUNTERS.map((counter: ActivityCounter): React.JSX.Element => (
          <div className="flex flex-col items-center gap-1" key={counter.key}>
            <dd className="font-mono text-lg font-medium tabular-nums" data-testid={counter.testId}>
              {stats[counter.key]}
            </dd>
            <dt className="text-xs text-muted-foreground">{counter.label}</dt>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground" data-testid="activity-window">
        {`${windowLabel(stats.window_days)} · ${lastActivityLabel(stats.last_activity_at, now)}`}
      </p>
      {isEmptyWindow ? (
        <p className="text-xs text-muted-foreground" data-testid="activity-empty">
          {emptyWindowLabel(stats)}
        </p>
      ) : null}
    </div>
  );
}

/** „Ostatnie 30 dni”, a dla okna jednodniowego „Ostatni dzień” — bez liczebnika, który się odmienia. */
function windowLabel(window_days: number): string {
  return window_days === 1 ? 'Ostatni dzień' : `Ostatnie ${window_days} dni`;
}

/** Dokładna data i — gdy zegar symulowany już jest — wiek, jak w tabelach („8 dni temu”). */
function lastActivityLabel(last_activity_at: string | null, now: string | null): string {
  if (last_activity_at === null) {
    return 'brak jakiejkolwiek aktywności';
  }
  const age: string = now === null ? '' : ` (${formatDaysAgo(daysSince(last_activity_at, now))})`;

  return `ostatnia aktywność ${formatDateTimePl(last_activity_at)}${age}`;
}

/**
 * Puste okno to nie „0 / 0 / 0”, tylko materiał do decyzji: brak dowodu użycia. Zdanie mówi,
 * czy dostęp nie ma żadnej aktywności, czy ma ją starszą niż okno — te dwa przypadki prowadzą
 * do różnych wniosków przy przedłużaniu dostępu.
 */
function emptyWindowLabel(stats: LeaseActivityStats): string {
  if (stats.last_activity_at === null) {
    return `Brak pushów, review i komentarzy w ostatnich ${stats.window_days} dniach — ten dostęp nie ma żadnej aktywności.`;
  }

  return `Ostatnia aktywność jest starsza niż ${stats.window_days} dni — w tym oknie nie ma dowodu użycia.`;
}
