import 'react-day-picker/style.css';

import { useState } from 'react';
import { pl } from 'react-day-picker/locale';

import {
  CUSTOM_DAYS_MAX,
  CUSTOM_DAYS_MIN,
  type ExtensionChoice,
  formatMultiplier,
  isMultiplierChosen,
  isPresetChosen,
  type Multiplier,
  MULTIPLIERS,
  PRESET_DAYS,
  type PresetDays,
  toIsoDate,
} from '@/components/leases/extensionChoice';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ExtensionControlsProps {
  choice: ExtensionChoice | null;
  customDays: string;
  simulatedNow: string | null;
  /**
   * Zdanie zamiast kontrolek, gdy silnik nie przyjmie `EXTEND` (np. dostęp administratora);
   * `null`/brak = zwykłe przedłużanie. Tryb odwołania nie podaje go wcale.
   */
  disabledReason?: string | null;
  onChoiceChange: (choice: ExtensionChoice) => void;
  onCustomDaysChange: (value: string) => void;
}

export function ExtensionControls({
  choice,
  customDays,
  simulatedNow,
  disabledReason = null,
  onChoiceChange,
  onCustomDaysChange,
}: ExtensionControlsProps): React.JSX.Element {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);

  function handleDateSelect(date: Date | undefined): void {
    if (date === undefined) {
      return;
    }
    onChoiceChange({ kind: 'date', date: toIsoDate(date) });
    setIsDatePickerOpen(false);
  }

  if (disabledReason !== null) {
    return <p className="text-sm text-muted-foreground">{disabledReason}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESET_DAYS.map((days: PresetDays) => (
          <Button
            key={days}
            variant={isPresetChosen(choice, days) ? 'default' : 'outline'}
            size="sm"
            aria-pressed={isPresetChosen(choice, days)}
            onClick={() => onChoiceChange({ kind: 'preset', days })}
          >
            {`+${days}`}
          </Button>
        ))}
        {MULTIPLIERS.map((multiplier: Multiplier) => (
          <Button
            key={multiplier}
            variant={isMultiplierChosen(choice, multiplier) ? 'default' : 'outline'}
            size="sm"
            aria-pressed={isMultiplierChosen(choice, multiplier)}
            onClick={() => onChoiceChange({ kind: 'multiplier', multiplier })}
          >
            {formatMultiplier(multiplier)}
          </Button>
        ))}
      </div>

      {/* Własna liczba dni i data w jednym rzędzie — to dwie alternatywy dla presetów wyżej. */}
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="decision-custom-days" className="shrink-0 text-muted-foreground">
          Własna liczba dni
        </Label>
        <Input
          id="decision-custom-days"
          type="number"
          inputMode="numeric"
          min={CUSTOM_DAYS_MIN}
          max={CUSTOM_DAYS_MAX}
          placeholder="1–365"
          className="h-8 w-20"
          value={customDays}
          onChange={(event) => onCustomDaysChange(event.target.value)}
        />
        <span className="text-sm text-muted-foreground">albo</span>
        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <PopoverTrigger asChild>
            {/* Bez czasu symulowanego nie da się zwalidować daty ani ustawić miesiąca kalendarza. */}
            <Button variant="outline" size="sm" disabled={simulatedNow === null}>
              Data
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              locale={pl}
              defaultMonth={simulatedNow === null ? undefined : new Date(simulatedNow)}
              selected={choice?.kind === 'date' ? new Date(`${choice.date}T00:00:00`) : undefined}
              onSelect={handleDateSelect}
            />
          </PopoverContent>
        </Popover>
        {choice?.kind === 'date' ? (
          <span className="text-sm text-muted-foreground">{choice.date}</span>
        ) : null}
        {simulatedNow === null ? (
          <span className="text-xs text-muted-foreground">Czekam na czas symulowany…</span>
        ) : null}
      </div>
    </div>
  );
}
