import { Button } from '@/components/ui/button';

export interface DecisionKindOption<Kind extends string> {
  value: Kind;
  label: string;
}

export interface DecisionKindSwitchProps<Kind extends string> {
  options: DecisionKindOption<Kind>[];
  value: Kind;
  onChange: (kind: Kind) => void;
  disabled?: boolean;
}

/**
 * Przełącznik „co robimy” w modalu decyzji: modal pokazuje kontrolki **jednej** akcji naraz,
 * zamiast stawiać przedłużenie, deeskalację i odebranie w osobnych ramkach jedna pod drugą.
 * Stan niesie `aria-pressed` (nie sam kolor), a cała grupa ma nazwę „Rodzaj decyzji”.
 */
export function DecisionKindSwitch<Kind extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: DecisionKindSwitchProps<Kind>): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Rodzaj decyzji"
      className="inline-flex w-full gap-1 rounded-lg bg-muted p-1"
    >
      {options.map((option: DecisionKindOption<Kind>): React.JSX.Element => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={option.value === value ? 'outline' : 'ghost'}
          aria-pressed={option.value === value}
          disabled={disabled}
          className="flex-1 aria-pressed:bg-background aria-pressed:shadow-xs"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
