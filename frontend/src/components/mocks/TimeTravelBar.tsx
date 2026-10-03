import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDemoReset } from '@/hooks/useDemoReset';
import { useSimulatedClock } from '@/hooks/useSimulatedClock';
import { useTimeTravel } from '@/hooks/useTimeTravel';
import { formatDateTimePl, formatOffsetDays } from '@/lib/dateTime';

const PRESET_DAYS: readonly number[] = [15, 30, 60];
const MIN_CUSTOM_DAYS = 1;
const MAX_CUSTOM_DAYS = 365;
const CUSTOM_DAYS_INPUT_ID = 'time-travel-custom-days';
const CUSTOM_DAYS_ERROR_ID = 'time-travel-custom-days-error';
const CUSTOM_DAYS_LABEL = 'Własna liczba dni';
const NON_POSITIVE_MESSAGE = 'Podaj dodatnią liczbę dni';
const OUT_OF_RANGE_MESSAGE = 'Podaj liczbę dni z zakresu 1–365';
const JUMP_TOAST = 'Zmieniono czas symulowany';
const RESET_TOAST = 'Przywrócono scenariusz demo';
const JUMP_ERROR = 'Nie udało się zmienić czasu symulowanego.';
const RESET_ERROR = 'Nie udało się zresetować scenariusza demo.';
const RESET_DISABLED_ERROR = 'Reset demo jest wyłączony na serwerze (ENABLE_DEMO_RESET=false).';

interface CustomDaysValidation {
  days: number | null;
  message: string | null;
}

/** `TimeTravelRequest.days` przyjmuje wyłącznie liczbę całkowitą z zakresu 1…365. */
function validateCustomDays(rawValue: string): CustomDaysValidation {
  const value = rawValue.trim();

  if (!/^\d+$/.test(value)) {
    return { days: null, message: NON_POSITIVE_MESSAGE };
  }

  const days = Number(value);

  if (days < MIN_CUSTOM_DAYS) {
    return { days: null, message: NON_POSITIVE_MESSAGE };
  }

  if (days > MAX_CUSTOM_DAYS) {
    return { days: null, message: OUT_OF_RANGE_MESSAGE };
  }

  return { days, message: null };
}

/**
 * Pasek czasu symulowanego: bieżący czas z `GET /simulation/clock` oraz sterowanie
 * podróżą w czasie (presety, własna liczba dni, reset scenariusza demo).
 */
export function TimeTravelBar(): React.JSX.Element {
  const clock = useSimulatedClock();
  const timeTravel = useTimeTravel();
  const demoReset = useDemoReset();
  const [customDays, setCustomDays] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const isBusy = timeTravel.isPending || demoReset.isPending;

  function jump(days: number): void {
    setValidationMessage(null);
    setMutationError(null);
    timeTravel.mutate(
      { days },
      {
        onSuccess: (): void => {
          setCustomDays('');
          toast.success(JUMP_TOAST);
        },
        // Bez tego nieudane przesunięcie (np. brak backendu) wygląda jak zawieszony przycisk.
        onError: (): void => {
          setMutationError(JUMP_ERROR);
          toast.error(JUMP_ERROR);
        },
      },
    );
  }

  function submitCustomDays(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const validation = validateCustomDays(customDays);

    if (validation.days === null) {
      setValidationMessage(validation.message);
      return;
    }

    jump(validation.days);
  }

  function confirmReset(): void {
    setMutationError(null);
    demoReset.mutate(undefined, {
      onSuccess: (): void => {
        setIsResetDialogOpen(false);
        setCustomDays('');
        setValidationMessage(null);
        toast.success(RESET_TOAST);
      },
      onError: (error: Error): void => {
        // `ENABLE_DEMO_RESET=false` zwraca 404 — na scenie to musi być czytelny komunikat,
        // a nie zawieszony przycisk (spec §9).
        const message =
          error instanceof ApiError && error.status === 404 ? RESET_DISABLED_ERROR : RESET_ERROR;

        setIsResetDialogOpen(false);
        setMutationError(message);
        toast.error(message);
      },
    });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="truncate text-xs font-medium text-foreground">
          {clock.data ? formatDateTimePl(clock.data.now) : '—'}
        </span>
        <span className="text-[0.7rem] text-muted-foreground">
          Przesunięcie: {clock.data ? formatOffsetDays(clock.data.offset_days) : '—'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {PRESET_DAYS.map((days: number): React.JSX.Element => (
          <Button
            key={days}
            type="button"
            size="xs"
            variant="outline"
            disabled={isBusy}
            onClick={(): void => jump(days)}
          >
            +{days} dni
          </Button>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-1" onSubmit={submitCustomDays}>
        <Label htmlFor={CUSTOM_DAYS_INPUT_ID} className="sr-only">
          {CUSTOM_DAYS_LABEL}
        </Label>
        <Input
          id={CUSTOM_DAYS_INPUT_ID}
          name={CUSTOM_DAYS_INPUT_ID}
          className="h-6 w-12 px-1.5 text-xs md:text-xs"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dni"
          value={customDays}
          disabled={isBusy}
          aria-invalid={validationMessage !== null}
          aria-describedby={validationMessage === null ? undefined : CUSTOM_DAYS_ERROR_ID}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
            setCustomDays(event.target.value);
            setValidationMessage(null);
          }}
        />
        <Button type="submit" size="xs" disabled={isBusy}>
          Przesuń
        </Button>

        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <DialogTrigger asChild>
            {/* `outline`, nie `destructive`: czerwony jest zarezerwowany dla odbioru dostępu
                (DESIGN.md §1), a sam reset ma już ostrzeżenie w dialogu potwierdzenia. */}
            <Button type="button" size="xs" variant="outline" disabled={isBusy}>
              Reset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zresetować scenariusz demo?</DialogTitle>
              <DialogDescription>
                Reset kasuje bazę danych demo, przywraca dane startowe i zeruje zegar symulowany.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm" disabled={isBusy}>
                  Anuluj
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isBusy}
                onClick={confirmReset}
              >
                Potwierdzam reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </form>

      {validationMessage !== null && (
        <p id={CUSTOM_DAYS_ERROR_ID} role="alert" className="text-[0.7rem] text-destructive">
          {validationMessage}
        </p>
      )}

      {mutationError !== null && (
        <p role="alert" className="text-[0.7rem] text-destructive">
          {mutationError}
        </p>
      )}
    </div>
  );
}
