import type { LeaseActivityStats } from '@/api/activity';

export interface ActivityStatsProps {
  stats: LeaseActivityStats;
}

interface ActivityCounter {
  key: keyof LeaseActivityStats;
  label: string;
  testId: string;
}

/** Kolejność i etykiety liczników; `key` jest kluczem kontraktu 4.4, więc rozjazd nazw nie przejdzie. */
const ACTIVITY_COUNTERS: ActivityCounter[] = [
  { key: 'push', label: 'Push', testId: 'stat-push' },
  { key: 'review', label: 'Review', testId: 'stat-review' },
  { key: 'comment', label: 'Komentarze', testId: 'stat-comment' },
];

/**
 * Statystyki użycia dzierżawy (push / review / komentarze) w modalu decyzji — UC-3.
 *
 * Liczby pochodzą wprost z `LeaseActivityStats`; frontend ich nie przelicza. Kolorów stanu
 * tu nie ma (żadna z tych liczb nie jest statusem), więc kafelki zostają na tokenach
 * neutralnych, a liczba jest daną i idzie w `font-mono`.
 */
export function ActivityStats({ stats }: ActivityStatsProps): React.JSX.Element {
  return (
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
  );
}
