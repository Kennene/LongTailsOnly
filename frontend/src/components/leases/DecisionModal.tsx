import 'react-day-picker/style.css';

import { type ChangeEvent, useState } from 'react';
import { pl } from 'react-day-picker/locale';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLeaseDecision } from '@/hooks/useLeaseDecision';
import { useSimulatedClock } from '@/hooks/useSimulatedClock';
import { daysRemaining, formatDaysRemaining } from '@/lib/dateTime';
import { getRecommendationLabel, getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import type { DecisionRequest, Extension, LeaseOverview } from '@/types/api';

export interface DecisionModalProps {
  lease: LeaseOverview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PresetDays = 7 | 14 | 30 | 90;
type Multiplier = 1.5 | 2;

/** Dokładnie jeden wariant przedłużenia wybierany w modalu (ADR 0005). */
type ExtensionChoice =
  | { kind: 'preset'; days: PresetDays }
  | { kind: 'multiplier'; multiplier: Multiplier }
  | { kind: 'custom' }
  | { kind: 'date'; date: string };

const PRESET_DAYS: PresetDays[] = [7, 14, 30, 90];
const MULTIPLIERS: Multiplier[] = [1.5, 2];
const CUSTOM_DAYS_MIN = 1;
const CUSTOM_DAYS_MAX = 365;
const CUSTOM_DAYS_ERROR = 'Podaj liczbę dni z zakresu 1–365';
const PAST_DATE_ERROR = 'Data musi być późniejsza niż czas symulowany';
const LAST_ADMIN_ERROR = 'Nie można odebrać uprawnień ostatniemu administratorowi.';
const SUCCESS_MESSAGE = 'Decyzja zapisana';

/** Lokalna data kalendarza → `YYYY-MM-DD`, czyli kontraktowe `Extension.until_date`. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function buildExtension(choice: ExtensionChoice, customDays: string): Extension | null {
  if (choice.kind === 'preset') {
    return { preset_days: choice.days };
  }
  if (choice.kind === 'multiplier') {
    return { multiplier: choice.multiplier };
  }
  if (choice.kind === 'date') {
    return { until_date: choice.date };
  }

  const days = Number.parseInt(customDays, 10);
  if (!Number.isInteger(days) || days < CUSTOM_DAYS_MIN || days > CUSTOM_DAYS_MAX) {
    return null;
  }

  return { custom_days: days };
}

function isPresetChosen(choice: ExtensionChoice | null, days: PresetDays): boolean {
  return choice?.kind === 'preset' && choice.days === days;
}

function isMultiplierChosen(choice: ExtensionChoice | null, multiplier: Multiplier): boolean {
  return choice?.kind === 'multiplier' && choice.multiplier === multiplier;
}

export function DecisionModal({
  lease,
  open,
  onOpenChange,
}: DecisionModalProps): React.JSX.Element {
  return (
    <Dialog open={open && lease !== null} onOpenChange={onOpenChange}>
      {open && lease !== null ? (
        // `key` czyści wybór i błędy przy każdej zmianie dzierżawy oraz ponownym otwarciu.
        <DecisionForm key={lease.id} lease={lease} onOpenChange={onOpenChange} />
      ) : null}
    </Dialog>
  );
}

interface DecisionFormProps {
  lease: LeaseOverview;
  onOpenChange: (open: boolean) => void;
}

function DecisionForm({ lease, onOpenChange }: DecisionFormProps): React.JSX.Element {
  const clock = useSimulatedClock();
  const decision = useLeaseDecision();
  const [choice, setChoice] = useState<ExtensionChoice | null>(null);
  const [customDays, setCustomDays] = useState<string>('');
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState<boolean>(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const now: string | null = clock.data?.now ?? null;
  const statusBadge = getStatusBadge(lease.status);

  function sendDecision(request: DecisionRequest): void {
    setError(null);
    decision.mutate(
      { lease_id: lease.id, request },
      {
        onSuccess: (): void => {
          toast.success(SUCCESS_MESSAGE);
          onOpenChange(false);
        },
        onError: (failure: Error): void => {
          setError(
            failure instanceof ApiError && failure.status === 403
              ? LAST_ADMIN_ERROR
              : failure.message,
          );
        },
      },
    );
  }

  function selectChoice(next: ExtensionChoice): void {
    setChoice(next);
    setError(null);
  }

  function handleCustomDaysChange(event: ChangeEvent<HTMLInputElement>): void {
    setCustomDays(event.target.value);
    selectChoice({ kind: 'custom' });
  }

  function handleDateSelect(date: Date | undefined): void {
    if (date === undefined) {
      return;
    }
    selectChoice({ kind: 'date', date: toIsoDate(date) });
    setIsDatePickerOpen(false);
  }

  function handleSubmit(): void {
    if (choice === null || decision.isPending) {
      return;
    }
    if (choice.kind === 'date' && (now === null || daysRemaining(choice.date, now) <= 0)) {
      setError(PAST_DATE_ERROR);
      return;
    }

    const extension = buildExtension(choice, customDays);
    if (extension === null) {
      setError(CUSTOM_DAYS_ERROR);
      return;
    }

    sendDecision({ action: 'EXTEND', extension });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Decyzja o dzierżawie</DialogTitle>
        <DialogDescription>{`${lease.user.name} (${lease.user.login})`}</DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Repozytorium</dt>
        <dd className="font-medium">{`${lease.repository.owner}/${lease.repository.name}`}</dd>
        <dt className="text-muted-foreground">Rola</dt>
        <dd className="font-medium">{getRoleLabel(lease.current_role)}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <Badge variant="outline" className={statusBadge.className}>
            {statusBadge.label}
          </Badge>
        </dd>
        <dt className="text-muted-foreground">Czas do wygaśnięcia</dt>
        <dd>{formatDaysRemaining(lease.days_remaining)}</dd>
        <dt className="text-muted-foreground">Rekomendacja</dt>
        <dd className="font-medium">{getRecommendationLabel(lease.recommendation)}</dd>
      </dl>

      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Przedłuż</h3>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_DAYS.map((days: PresetDays) => (
            <Button
              key={days}
              variant={isPresetChosen(choice, days) ? 'default' : 'outline'}
              size="sm"
              aria-pressed={isPresetChosen(choice, days)}
              onClick={() => selectChoice({ kind: 'preset', days })}
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
              onClick={() => selectChoice({ kind: 'multiplier', multiplier })}
            >
              {`${String(multiplier).replace('.', ',')}x`}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
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
            className="w-24"
            value={customDays}
            onChange={handleCustomDaysChange}
          />
        </div>

        <div className="flex items-center gap-2">
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              {/* Bez czasu symulowanego nie da się zwalidować daty ani ustawić miesiąca kalendarza. */}
              <Button variant="outline" size="sm" disabled={now === null}>
                Data
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                locale={pl}
                defaultMonth={now === null ? undefined : new Date(now)}
                selected={choice?.kind === 'date' ? new Date(`${choice.date}T00:00:00`) : undefined}
                onSelect={handleDateSelect}
              />
            </PopoverContent>
          </Popover>
          {choice?.kind === 'date' ? (
            <span className="text-sm text-muted-foreground">{choice.date}</span>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Odbierz dostęp</h3>
        <div className="flex flex-wrap gap-1.5">
          {isConfirmingRevoke ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={decision.isPending}
                onClick={() => sendDecision({ action: 'REVOKE' })}
              >
                Potwierdzam wyłączenie
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsConfirmingRevoke(false);
                  setError(null);
                }}
              >
                Zostaw dostęp
              </Button>
            </>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setIsConfirmingRevoke(true);
                setError(null);
              }}
            >
              Wyłącz
            </Button>
          )}
          {lease.current_role !== 'read' ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={decision.isPending}
              onClick={() => sendDecision({ action: 'DOWNSCOPE' })}
            >
              Zdeeskaluj
            </Button>
          ) : null}
        </div>
      </section>

      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Zamknij
        </Button>
        <Button disabled={choice === null || decision.isPending} onClick={handleSubmit}>
          Zatwierdź decyzję
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
