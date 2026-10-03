import type { ChangeEvent } from 'react';

import { Label } from '@/components/ui/label';
import { SELECT_CLASSES } from '@/lib/selectClasses';
import { cn } from '@/lib/utils';
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
        // Natywny `<select>`: jest dostępny bez JS, a Radixowy `Select` z `components/ui` nie
        // przyjmuje `userEvent.selectOptions` (plan 5.10) i wymaga polyfilli w jsdom — ta sama
        // decyzja co w 5.8a. `SELECT_CLASSES` to wspólny rdzeń (spec §6), a `px-2`, `sm:w-40`
        // i `disabled:*` to różnice tego pola.
        className={cn(
          SELECT_CLASSES,
          'w-full px-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-40',
        )}
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
