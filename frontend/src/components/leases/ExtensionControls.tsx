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

/**
 * Przedłużenie w tym samym układzie co pole uzasadnienia przy „Zdeeskaluj” i „Odbierz”: etykieta
 * nad polem, pod nią wąskie pole „Liczba dni” po lewej i skróty +7 / +30 / +60 po prawej, które
 * wpisują liczbę do pola.
 */
export function ExtensionControls({
  days,
  disabledReason = null,
  onDaysChange,
}: ExtensionControlsProps): React.JSX.Element {
  if (disabledReason !== null) {
    return <p className="text-center text-sm text-muted-foreground">{disabledReason}</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="decision-custom-days">Liczba dni</Label>
      {/* Wąskie pole przy lewej krawędzi, skróty dosunięte do prawej. */}
      <div className="flex items-center justify-between gap-2">
        <Input
          id="decision-custom-days"
          type="number"
          inputMode="numeric"
          min={CUSTOM_DAYS_MIN}
          max={CUSTOM_DAYS_MAX}
          placeholder="1–365"
          className="w-28"
          value={days}
          onChange={(event) => onDaysChange(event.target.value)}
        />
        <div className="flex gap-2">
          {QUICK_DAYS.map((quick: number) => (
            <Button
              key={quick}
              type="button"
              variant={days === String(quick) ? 'default' : 'outline'}
              aria-pressed={days === String(quick)}
              onClick={() => onDaysChange(String(quick))}
            >
              {`+${String(quick)}`}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
