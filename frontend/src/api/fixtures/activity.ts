import activityJson from '@shared/fixtures/activity.json';

import { DAY_MS } from '@/lib/dateTime';
import type { ActivityEventRead, LeaseActivityStats, LeaseOverview } from '@/types/api';

/** Pole kontraktu, do którego trafia zdarzenie — dzięki temu rozjazd nazwy nie przejdzie `tsc`. */
type ActivityCountField = 'push_count' | 'review_count' | 'comment_count';

/**
 * Zdarzenia dowodu użycia — dokładnie te, które backend liczy w `RENEWING_ACTIONS`
 * (`backend/app/domain/roles.py`). Inne typy (`PullRequestEvent`, `IssuesEvent`, `PublicEvent`)
 * nie wchodzą ani do liczników, ani do `last_activity_at`.
 */
const RENEWING_ACTION_FIELD: Record<string, ActivityCountField | undefined> = {
  PushEvent: 'push_count',
  PullRequestReviewEvent: 'review_count',
  IssueCommentEvent: 'comment_count',
};

/**
 * Okno statystyk to `repository.default_lease_duration_days` (`lease_service.lease_activity_stats`),
 * a nie stała frontendu. Zapas stosujemy tylko wtedy, gdy dzierżawy nie ma w fixture'ach — w seedzie
 * każde repozytorium ma 30 dni (`shared/fixtures/repositories.json`).
 */
const FALLBACK_WINDOW_DAYS = 30;

/**
 * Zdarzenia aktywności ze wspólnego fixture'u (`shared/fixtures/activity.json`, 8 z 46 zdarzeń seeda).
 *
 * Backend liczy z nich statystyki per dzierżawa, ale nie ma ich w `shared/`, więc odtwarzamy tę
 * samą regułę tutaj — i **nigdy nie wpisujemy liczb**: `push_count`, `review_count` i
 * `comment_count` to zliczenia `action_type` dla pary `(user_id, repo_id)`, którą wyznacza
 * dzierżawa. Dzięki temu liczby w modalu decyzji (m.in. UC-2: brak pushów w `payment-service`)
 * wynikają z tych samych danych co seed, a nie z jednej trójki pokazywanej przy każdej dzierżawie.
 */
export const activityEventsFixture: ActivityEventRead[] = activityJson as ActivityEventRead[];

/**
 * Statystyki użycia dzierżawy w kształcie kontraktu `LeaseActivityStats` (krok 3.6), liczone
 * z `shared/fixtures/activity.json`.
 *
 * Reguła jest przepisana z backendu: bierzemy zdarzenia pary `(user_id, repo_id)` z akcji
 * odnawiających, nie późniejsze niż `now`, do liczników wpuszczamy te z okna
 * `[now - window_days, now]`, a `last_activity_at` to najnowsze zdarzenie **całej** pary — także
 * starsze niż okno. Bez tego ostatniego pola panel nie odróżniłby „nigdy nic nie zrobił” od
 * „pracował, ale dawno temu”.
 */
export function countActivityStats(
  lease_id: number,
  lease: LeaseOverview | undefined,
  now: string,
  events: ActivityEventRead[] = activityEventsFixture,
): LeaseActivityStats {
  const window_days: number = lease?.repository.default_lease_duration_days ?? FALLBACK_WINDOW_DAYS;
  const window_end: number = Date.parse(now);
  const window_start: number = window_end - window_days * DAY_MS;
  const renewing: ActivityEventRead[] =
    lease === undefined ? [] : events.filter((event) => isRenewingFor(event, lease, window_end));

  const stats: LeaseActivityStats = {
    lease_id,
    window_days,
    window_start: new Date(window_start).toISOString(),
    // Koniec okna to czas symulowany w postaci, w jakiej przyszedł z zegara — tak samo robi backend.
    window_end: now,
    push_count: 0,
    review_count: 0,
    comment_count: 0,
    last_activity_at: newestActivityAt(renewing),
  };

  renewing
    .filter((event: ActivityEventRead): boolean => Date.parse(event.timestamp) >= window_start)
    .forEach((event: ActivityEventRead): void => {
      const field: ActivityCountField | undefined = RENEWING_ACTION_FIELD[event.action_type];
      if (field !== undefined) {
        stats[field] += 1;
      }
    });

  return stats;
}

/** Zdarzenie tej samej pary (użytkownik + repozytorium), odnawiające i nie z przyszłości. */
function isRenewingFor(event: ActivityEventRead, lease: LeaseOverview, notAfter: number): boolean {
  return (
    event.user_id === lease.user.id &&
    event.repo_id === lease.repository.id &&
    RENEWING_ACTION_FIELD[event.action_type] !== undefined &&
    Date.parse(event.timestamp) <= notAfter
  );
}

/**
 * Najnowszy znacznik czasu pary jako ISO albo `null`, gdy para nie ma żadnego zdarzenia.
 * Zwracamy **oryginalny** string z fixture'u, żeby panel pokazywał ten sam znacznik co tabela
 * dzierżaw (`LeaseOverview.last_activity_at`).
 */
function newestActivityAt(events: ActivityEventRead[]): string | null {
  return events
    .map((event: ActivityEventRead): string => event.timestamp)
    .reduce(
      (newest: string | null, timestamp: string): string | null =>
        newest === null || Date.parse(timestamp) > Date.parse(newest) ? timestamp : newest,
      null,
    );
}
