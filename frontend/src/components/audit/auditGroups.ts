import { groupBy } from '@/lib/grouping';
import type { ActorType, AuditEntry } from '@/types/api';

/** Wpisy jednego aktora: dziennik pokazuje go raz, a jego zdarzenia po rozwinięciu. */
export interface AuditGroup {
  key: string;
  actorType: ActorType;
  /** Login, `#id` albo kreska (SYSTEM nie ma człowieka) — jak w komórce „Aktor”. */
  identity: string;
  /** Jak nazwać grupę w etykiecie przełącznika: login, a bez niego typ aktora. */
  owner: string;
  /** Od najnowszego. */
  entries: AuditEntry[];
  latestAt: string;
}

/**
 * Tożsamość aktora: backend rozwiązuje `actor_login` (LEFT JOIN z `users`), więc pokazujemy login,
 * a nie `#id`. Wpis SYSTEM nie ma człowieka — zostaje sam typ i kreska, nigdy pusta komórka.
 */
export function formatActorIdentity(entry: AuditEntry): string {
  if (entry.actor_login !== null) {
    return entry.actor_login;
  }

  return entry.actor_id === null ? '—' : `#${entry.actor_id}`;
}

function newestFirst(left: AuditEntry, right: AuditEntry): number {
  return Date.parse(right.timestamp) - Date.parse(left.timestamp);
}

/** Jedna grupa na aktora (typ + tożsamość); grupy od najświeższego wpisu. */
export function groupAuditByActor(entries: AuditEntry[]): AuditGroup[] {
  const byActor: Map<string, AuditEntry[]> = groupBy(
    entries,
    (entry: AuditEntry): string => `${entry.actor_type}:${formatActorIdentity(entry)}`,
  );

  const groups: AuditGroup[] = [...byActor.entries()].map(
    ([key, actorEntries]: [string, AuditEntry[]]): AuditGroup => {
      const sorted: AuditEntry[] = actorEntries.toSorted(newestFirst);
      const identity: string = formatActorIdentity(sorted[0]);
      return {
        key,
        actorType: sorted[0].actor_type,
        identity,
        owner: identity === '—' ? sorted[0].actor_type : identity,
        entries: sorted,
        latestAt: sorted[0].timestamp,
      };
    },
  );

  return groups.toSorted(
    (left: AuditGroup, right: AuditGroup): number =>
      Date.parse(right.latestAt) - Date.parse(left.latestAt),
  );
}
