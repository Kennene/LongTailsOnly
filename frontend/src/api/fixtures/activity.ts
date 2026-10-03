import activityJson from '@shared/fixtures/activity.json';

import type { LeaseActivityStats } from '@/api/activity';
import type { ActivityEventRead, LeaseOverview } from '@/types/api';

/**
 * Zdarzenia aktywności ze wspólnego fixture'u (`shared/fixtures/activity.json`, 8 z 46 zdarzeń seeda).
 *
 * Backend nie ma endpointu statystyk per dzierżawa, więc liczymy je tutaj — ale **nigdy nie
 * wpisujemy liczb**: `push`, `review` i `comment` to zliczenia `action_type` dla pary
 * `(user_id, repo_id)`, którą wyznacza dzierżawa. Dzięki temu liczby w modalu decyzji
 * (m.in. UC-2: brak pushów w `payment-service`) wynikają z tych samych danych co seed,
 * a nie z jednej trójki pokazywanej przy każdej dzierżawie.
 */
export const activityEventsFixture: ActivityEventRead[] = activityJson as ActivityEventRead[];

const ACTION_COUNTER: Record<string, keyof LeaseActivityStats | undefined> = {
  PushEvent: 'push',
  PullRequestReviewEvent: 'review',
  IssueCommentEvent: 'comment',
};

/**
 * Statystyki użycia dzierżawy: zdarzenia jej użytkownika w jej repozytorium, nie późniejsze niż
 * `notAfter`. Zdarzenia z przyszłości nie powstają (`docs/github-mock.md`), więc po cofnięciu
 * zegara symulowanego nie mogą się liczyć jako użycie.
 */
export function countActivityStats(
  lease: LeaseOverview | undefined,
  notAfter: string,
  events: ActivityEventRead[] = activityEventsFixture,
): LeaseActivityStats {
  const stats: LeaseActivityStats = { push: 0, review: 0, comment: 0 };

  if (lease === undefined) {
    return stats;
  }

  const cutoff: number = Date.parse(notAfter);

  events
    .filter(
      (event: ActivityEventRead): boolean =>
        event.user_id === lease.user.id &&
        event.repo_id === lease.repository.id &&
        Date.parse(event.timestamp) <= cutoff,
    )
    .forEach((event: ActivityEventRead): void => {
      const counter: keyof LeaseActivityStats | undefined = ACTION_COUNTER[event.action_type];
      if (counter !== undefined) {
        stats[counter] += 1;
      }
    });

  return stats;
}
