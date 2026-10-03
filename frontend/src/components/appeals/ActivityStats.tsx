import { formatDateTimePl } from '@/lib/dateTime';
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
 * ma (żadna z tych liczb nie jest statusem), więc kafelki zostają na tokenach neutralnych,
 * a liczba jest daną i idzie w `font-mono`.
 */
export function ActivityStats({ stats }: ActivityStatsProps): React.JSX.Element {
  const isEmptyWindow: boolean = stats.push_count + stats.review_count + stats.comment_count === 0;

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-3 gap-2">
        {ACTIVITY_COUNTERS.map((counter: ActivityCounter): React.JSX.Element => (
          <div
            className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-2"
            key={counter.key}
          >
            <dt className="text-xs text-muted-foreground">{counter.label}</dt>
            <dd className="font-mono text-2xl tabular-nums" data-testid={counter.testId}>
              {stats[counter.key]}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground" data-testid="activity-window">
        {`${windowLabel(stats.window_days)} · ${lastActivityLabel(stats.last_activity_at)}`}
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

function lastActivityLabel(last_activity_at: string | null): string {
  return last_activity_at === null
    ? 'brak jakiejkolwiek aktywności'
    : `ostatnia aktywność ${formatDateTimePl(last_activity_at)}`;
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
