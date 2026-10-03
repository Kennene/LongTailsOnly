import type { ChangeEvent } from 'react';

import { Label } from '@/components/ui/label';
import type { ActorType } from '@/types/api';

/** Wartość filtra aktora: konkretny aktor z kontraktu albo „Wszystkie”. */
export type AuditActorFilter = ActorType | 'ALL';

export interface AuditFiltersProps {
  actorType: AuditActorFilter;
  onChange: (actorType: AuditActorFilter) => void;
}

const ACTOR_FILTERS: AuditActorFilter[] = ['ALL', 'ADMIN', 'USER', 'SYSTEM'];

const FILTER_LABELS: Record<AuditActorFilter, string> = {
  ALL: 'Wszystkie',
  ADMIN: 'ADMIN',
  USER: 'USER',
  SYSTEM: 'SYSTEM',
};

// Natywny `<select>`: jest dostępny bez JS, a Radixowy `Select` z `components/ui` nie przyjmuje
// `userEvent.selectOptions` (plan 5.10) i wymaga polyfilli w jsdom — ta sama decyzja co w 5.8a.
const SELECT_CLASSES =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 sm:w-40';

const ACTOR_FILTER_ID = 'audit-actor-filter';

/**
 * Filtr aktora (spec §7.7) działający po stronie klienta — dziennik jest z natury krótki
 * (jeden przebieg demo), więc ponowne zapytanie do API nie jest potrzebne.
 */
export function AuditFilters({ actorType, onChange }: AuditFiltersProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ACTOR_FILTER_ID}>Aktor</Label>
      <select
        className={SELECT_CLASSES}
        id={ACTOR_FILTER_ID}
        onChange={(event: ChangeEvent<HTMLSelectElement>): void =>
          onChange(toActorFilter(event.target.value))
        }
        value={actorType}
      >
        {ACTOR_FILTERS.map((value: AuditActorFilter): React.JSX.Element => (
          <option key={value} value={value}>
            {FILTER_LABELS[value]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Wartość z DOM jest `string` — zawężamy ją do unii filtra, zamiast rzutować w ciemno. */
function toActorFilter(value: string): AuditActorFilter {
  return ACTOR_FILTERS.find((candidate: AuditActorFilter): boolean => candidate === value) ?? 'ALL';
}
