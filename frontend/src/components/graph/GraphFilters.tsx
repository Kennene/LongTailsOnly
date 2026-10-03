import type { ChangeEvent } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface GraphFiltersProps {
  /** Zespoły zebrane z węzłów (`data.team` osób oraz etykiety węzłów typu `team`). */
  teams: string[];
  /** `null` = wszystkie zespoły. */
  team: string | null;
  onTeamChange: (team: string | null) => void;
  onlyRisk: boolean;
  onOnlyRiskChange: (onlyRisk: boolean) => void;
}

const TEAM_SELECT_ID = 'graph-team-filter';
const RISK_SWITCH_ID = 'graph-risk-filter';

// Natywny `<select>`: Radixowy `Select` z `components/ui` nie przyjmuje `userEvent.selectOptions`
// i wymaga polyfilli w jsdom (plan testów 5.8a), a filtr zespołu to jedna lista wartości.
const SELECT_CLASSES =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/** Filtry grafu: zespół (`data.team`) i zwężenie widoku do podwyższonego ryzyka. */
export function GraphFilters({
  teams,
  team,
  onTeamChange,
  onlyRisk,
  onOnlyRiskChange,
}: GraphFiltersProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-6 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={TEAM_SELECT_ID}>Zespół</Label>
        <select
          className={SELECT_CLASSES}
          id={TEAM_SELECT_ID}
          onChange={(event: ChangeEvent<HTMLSelectElement>): void =>
            onTeamChange(event.target.value === '' ? null : event.target.value)
          }
          value={team ?? ''}
        >
          <option value="">Wszystkie</option>
          {teams.map((name: string): React.JSX.Element => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pb-1.5">
        <Switch checked={onlyRisk} id={RISK_SWITCH_ID} onCheckedChange={onOnlyRiskChange} />
        <Label htmlFor={RISK_SWITCH_ID}>Tylko podwyższone ryzyko</Label>
      </div>
    </div>
  );
}
