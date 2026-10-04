import { CUSTOM_DAYS_MAX, CUSTOM_DAYS_MIN, QUICK_DAYS } from '@/components/leases/extensionChoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ExtensionControlsProps {
  /** Wartość pola „Liczba dni” — tekst z inputu, walidowany dopiero przy wysyłce. */
  days: string;
  /**
   * Zdanie zamiast kontrolek, gdy silnik nie przyjmie `EXTEND` (np. dostęp administratora);
   * `null`/brak = zwykłe przedłużanie. Tryb odwołania nie podaje go wcale.
   */
  disabledReason?: string | null;
  onDaysChange: (value: string) => void;
}

/** Przedłużenie: skróty +7 / +30 / +60, które wpisują liczbę do pola, i samo pole „Liczba dni”. */
export function ExtensionControls({
  days,
  disabledReason = null,
  onDaysChange,
}: ExtensionControlsProps): React.JSX.Element {
  if (disabledReason !== null) {
    return <p className="text-center text-sm text-muted-foreground">{disabledReason}</p>;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {QUICK_DAYS.map((quick: number) => (
        <Button
          key={quick}
          type="button"
          variant={days === String(quick) ? 'default' : 'outline'}
          size="sm"
          aria-pressed={days === String(quick)}
          onClick={() => onDaysChange(String(quick))}
        >
          {`+${String(quick)}`}
        </Button>
      ))}
      <Label htmlFor="decision-custom-days" className="ml-2 shrink-0 text-muted-foreground">
        Liczba dni
      </Label>
      <Input
        id="decision-custom-days"
        type="number"
        inputMode="numeric"
        min={CUSTOM_DAYS_MIN}
        max={CUSTOM_DAYS_MAX}
        placeholder="1–365"
        className="h-8 w-20"
        value={days}
        onChange={(event) => onDaysChange(event.target.value)}
      />
    </div>
  );
}
