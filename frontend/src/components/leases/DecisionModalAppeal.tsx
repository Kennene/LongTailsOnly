import { type ChangeEvent, useState } from 'react';
import { toast } from 'sonner';

import { AppealContextPanel } from '@/components/leases/AppealContextPanel';
import { type ExtensionChoice } from '@/components/leases/extensionChoice';
import { ExtensionControls } from '@/components/leases/ExtensionControls';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRejectAppeal } from '@/hooks/useRejectAppeal';
import { useSimulatedClock } from '@/hooks/useSimulatedClock';
import { describeApiError } from '@/lib/apiErrors';
import { formatDaysRemaining } from '@/lib/dateTime';
import { getAppealStatusBadge, getRoleLabel } from '@/lib/statusBadges';
import type { AppealOverview } from '@/types/api';

export interface DecisionModalAppealProps {
  appeal: AppealOverview;
  onOpenChange: (open: boolean) => void;
}

const JUSTIFICATION_REQUIRED = 'Uzasadnienie odrzucenia jest wymagane';
const REJECTION_LABEL = 'Uzasadnienie odrzucenia';
const REJECTION_ERROR_ID = 'appeal-rejection-error';
const SUCCESS_MESSAGE = 'Odwołanie odrzucone';

/**
 * Zatwierdzenie odwołania rozstrzyga się w domenie odwołań: backend odsyła dostępy z odwołaniem
 * `PENDING` na `POST /api/v1/appeals/{id}/decision` (409, decyzja D13), a tego endpointu jeszcze nie
 * ma (zadanie 4.3C). Domena odwołań wystawia dziś wyłącznie `/reject`, więc przycisk zostaje
 * wyłączony, a nie udaje działającej akcji. Wybór przedłużenia zostaje jako szkic: pokazuje,
 * co odwołanie by dało.
 */
const APPROVE_UNAVAILABLE =
  'Zatwierdzenie odwołania wymaga POST /api/v1/appeals/{id}/decision, którego backend jeszcze nie ma (zadanie 4.3C) — działa tylko odrzucenie przez /reject.';

interface LeaseContext {
  repository: string;
  requested_role: string;
  lease_role: string;
  days: string;
  previous_appeals: number;
  status: string;
}

/** Wszystkie etykiety kontekstu w jednym miejscu — modal nie powtarza logiki badge'ów. */
function buildLeaseContext(appeal: AppealOverview): LeaseContext {
  return {
    repository: `${appeal.repository.owner}/${appeal.repository.name}`,
    requested_role: getRoleLabel(appeal.requested_role),
    lease_role: getRoleLabel(appeal.lease_role),
    days: appeal.lease_is_active ? formatDaysRemaining(appeal.days_remaining) : 'Dostęp nieaktywny',
    previous_appeals: appeal.previous_appeals,
    status: getAppealStatusBadge(appeal.status).label,
  };
}

/**
 * Rozpatrzenie odwołania (UC-3). Osoba, repozytorium, rola i pozostałe dni pochodzą
 * z `AppealOverview`, więc modal **nie potrzebuje** propa `lease` ani listy dostępów —
 * decyzję można podjąć także wtedy, gdy `GET /api/v1/leases` jeszcze nie istnieje.
 */
export function DecisionModalAppeal({
  appeal,
  onOpenChange,
}: DecisionModalAppealProps): React.JSX.Element {
  const clock = useSimulatedClock();
  const rejection = useRejectAppeal();
  const [justification, setJustification] = useState<string>('');
  // Tylko walidacja lokalna; błędy API lądują w `Alert` pod formularzem (jedno źródło prawdy).
  const [validationError, setValidationError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExtensionChoice | null>(null);
  const [draftCustomDays, setDraftCustomDays] = useState<string>('');

  const context: LeaseContext = buildLeaseContext(appeal);

  function handleReject(): void {
    const trimmed: string = justification.trim();
    if (trimmed.length === 0) {
      setValidationError(JUSTIFICATION_REQUIRED);
      return;
    }

    setValidationError(null);
    rejection.mutate(
      { appeal_id: appeal.id, justification: trimmed },
      {
        onSuccess: (): void => {
          toast.success(SUCCESS_MESSAGE);
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Rozpatrzenie odwołania</DialogTitle>
        <DialogDescription>{`${appeal.user.name} (${appeal.user.login})`}</DialogDescription>
      </DialogHeader>

      <AppealContextPanel appeal={appeal} />

      <dl
        className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm"
        data-testid="appeal-lease-context"
      >
        <dt className="text-muted-foreground">Repozytorium</dt>
        <dd className="font-medium">{context.repository}</dd>
        <dt className="text-muted-foreground">Wnioskowana rola</dt>
        <dd className="font-medium">{context.requested_role}</dd>
        <dt className="text-muted-foreground">Rola w dostępie</dt>
        <dd className="font-medium">{context.lease_role}</dd>
        <dt className="text-muted-foreground">Status wniosku</dt>
        <dd className="font-medium">{context.status}</dd>
        <dt className="text-muted-foreground">Czas do wygaśnięcia</dt>
        <dd>{context.days}</dd>
        <dt className="text-muted-foreground">Poprzednie odwołania</dt>
        <dd className="font-mono tabular-nums">{context.previous_appeals}</dd>
      </dl>

      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Odrzuć odwołanie</h3>
        <Label htmlFor="appeal-rejection-justification">{REJECTION_LABEL}</Label>
        <Textarea
          aria-describedby={validationError === null ? undefined : REJECTION_ERROR_ID}
          aria-invalid={validationError !== null}
          id="appeal-rejection-justification"
          onChange={(event: ChangeEvent<HTMLTextAreaElement>): void =>
            setJustification(event.target.value)
          }
          placeholder="Dlaczego wniosek nie zasługuje na przedłużenie dostępu."
          value={justification}
        />
        {validationError === null ? null : (
          <p
            className="text-xs text-status-expired-foreground"
            id={REJECTION_ERROR_ID}
            role="alert"
          >
            {validationError}
          </p>
        )}
        <Button
          className="self-start"
          disabled={rejection.isPending}
          onClick={handleReject}
          type="button"
          variant="destructive"
        >
          Odrzuć odwołanie
        </Button>
      </section>

      {rejection.error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>
            {describeApiError(rejection.error, 'Nie udało się odrzucić odwołania.')}
          </AlertDescription>
        </Alert>
      )}

      {/* Szkic przedłużenia należy do niedostępnej ścieżki zatwierdzenia: nie wysyła żądań,
          a pokazuje, jaki dostęp odwołanie by przywróciło. */}
      <ExtensionControls
        choice={draft}
        customDays={draftCustomDays}
        simulatedNow={clock.data?.now ?? null}
        onChoiceChange={setDraft}
        onCustomDaysChange={(value: string): void => {
          setDraftCustomDays(value);
          setDraft({ kind: 'custom' });
        }}
      />

      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Zatwierdzenie odwołania</h3>
        <p className="text-sm text-muted-foreground" id="appeal-approve-unavailable">
          {APPROVE_UNAVAILABLE}
        </p>
        <Button
          aria-describedby="appeal-approve-unavailable"
          className="self-start"
          disabled
          title={APPROVE_UNAVAILABLE}
          type="button"
          variant="secondary"
        >
          Zatwierdź odwołanie
        </Button>
      </section>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Zamknij
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
