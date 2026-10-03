import { type ChangeEvent, useState } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { AppealContextPanel } from '@/components/leases/AppealContextPanel';
import { DecisionActions } from '@/components/leases/DecisionActions';
import {
  buildExtension,
  CUSTOM_DAYS_ERROR,
  type ExtensionChoice,
} from '@/components/leases/extensionChoice';
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
import { useDecideAppeal } from '@/hooks/useDecideAppeal';
import { useRejectAppeal } from '@/hooks/useRejectAppeal';
import { useSimulatedClock } from '@/hooks/useSimulatedClock';
import { type ApiErrorDescription, describeApiError, describeEngineError } from '@/lib/apiErrors';
import { daysRemaining, formatDaysRemaining } from '@/lib/dateTime';
import { getAppealStatusBadge, getRoleLabel } from '@/lib/statusBadges';
import type { AppealOverview, DecisionRequest } from '@/types/api';

export interface DecisionModalAppealProps {
  appeal: AppealOverview;
  onOpenChange: (open: boolean) => void;
}

const JUSTIFICATION_REQUIRED = 'Uzasadnienie odrzucenia jest wymagane';
const REJECTION_LABEL = 'Uzasadnienie odrzucenia';
const REJECTION_ERROR_ID = 'appeal-rejection-error';
const REJECTION_SUCCESS = 'Odwołanie odrzucone';
const APPROVAL_SUCCESS = 'Odwołanie zatwierdzone';
const DECISION_SUCCESS = 'Decyzja zapisana';
const PAST_DATE_ERROR = 'Data musi być późniejsza niż czas symulowany';
const DECISION_FALLBACK = 'Nie udało się zapisać decyzji o dostępie.';
const ALREADY_RESOLVED = 'To odwołanie zostało już rozstrzygnięte.';

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
 * Zdanie po polsku dla błędu decyzji o dzierżawie.
 *
 * `409` z tego endpointu to wniosek rozstrzygnięty już wcześniej (`appeal_service.pending_appeal`),
 * a nie powtórzone uzasadnienie ani cudza dzierżawa — `describeEngineError` nie ma reguły na ten
 * komunikat i pokazałby angielski `detail` jako zdanie główne. Reszta (403 ostatniego admina,
 * 422 silnika) idzie wspólną tabelą `LEASE_DECISION`, bo to ta sama decyzja co w widoku dzierżaw.
 */
function describeDecisionError(error: Error): ApiErrorDescription {
  if (error instanceof ApiError && error.status === 409) {
    return { message: ALREADY_RESOLVED, detail: error.message };
  }

  return describeEngineError(error, 'LEASE_DECISION', DECISION_FALLBACK);
}

/**
 * Rozpatrzenie odwołania (UC-3). Osoba, repozytorium, rola i pozostałe dni pochodzą
 * z `AppealOverview`, więc modal **nie potrzebuje** propa `lease` ani listy dzierżaw.
 *
 * Wniosek rozstrzygają trzy drogi:
 *
 * - „Zatwierdź odwołanie” → `POST /api/v1/appeals/{id}/decision` z `EXTEND` i wybranym
 *   przedłużeniem (uzasadnienie opcjonalne): backend przedłuża dzierżawę i zamyka wniosek jako
 *   `APPROVED`,
 * - „Odbierz dostęp” → ten sam endpoint z `DOWNSCOPE`/`REVOKE` (uzasadnienie wymagane przez silnik,
 *   422 bez niego): dzierżawa traci uprawnienia, a wniosek zamyka się odrzuceniem,
 * - „Odrzuć odwołanie” → `POST /api/v1/appeals/{id}/reject`: wniosek zamyka się bez zmian
 *   w dzierżawie.
 */
export function DecisionModalAppeal({
  appeal,
  onOpenChange,
}: DecisionModalAppealProps): React.JSX.Element {
  const clock = useSimulatedClock();
  const rejection = useRejectAppeal();
  const decision = useDecideAppeal();
  const [justification, setJustification] = useState<string>('');
  // Tylko walidacja lokalna; błędy API lądują w `Alert` pod formularzem (jedno źródło prawdy).
  const [validationError, setValidationError] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);
  const [choice, setChoice] = useState<ExtensionChoice | null>(null);
  const [customDays, setCustomDays] = useState<string>('');

  const now: string | null = clock.data?.now ?? null;
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
          toast.success(REJECTION_SUCCESS);
          onOpenChange(false);
        },
      },
    );
  }

  function sendDecision(request: DecisionRequest, successMessage: string): void {
    setFailure(null);
    decision.mutate(
      { appeal_id: appeal.id, request },
      {
        onSuccess: (): void => {
          toast.success(successMessage);
          onOpenChange(false);
        },
        onError: (error: Error): void => {
          setFailure(describeDecisionError(error));
        },
      },
    );
  }

  function handleApprove(): void {
    if (choice === null || decision.isPending) {
      return;
    }
    if (choice.kind === 'date' && (now === null || daysRemaining(choice.date, now) <= 0)) {
      setFailure({ message: PAST_DATE_ERROR, detail: null });
      return;
    }

    const extension = buildExtension(choice, customDays);
    if (extension === null) {
      setFailure({ message: CUSTOM_DAYS_ERROR, detail: null });
      return;
    }

    sendDecision({ action: 'EXTEND', extension }, APPROVAL_SUCCESS);
  }

  function selectChoice(next: ExtensionChoice): void {
    setChoice(next);
    setFailure(null);
  }

  function handleCustomDaysChange(value: string): void {
    setCustomDays(value);
    selectChoice({ kind: 'custom' });
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

      <ExtensionControls
        choice={choice}
        customDays={customDays}
        simulatedNow={now}
        onChoiceChange={selectChoice}
        onCustomDaysChange={handleCustomDaysChange}
      />

      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Zatwierdzenie odwołania</h3>
        <p className="text-sm text-muted-foreground">
          Zatwierdzenie przedłuża dzierżawę o wybrany okres i zamyka wniosek. Deeskalacja albo
          odebranie dostępu idą przez decyzję o dzierżawie poniżej i wymagają uzasadnienia.
        </p>
        <Button
          className="self-start"
          disabled={choice === null || decision.isPending}
          onClick={handleApprove}
          type="button"
          variant="secondary"
        >
          Zatwierdź odwołanie
        </Button>
      </section>

      <DecisionActions
        currentRole={appeal.lease_role}
        isPending={decision.isPending}
        onDownscope={(reason: string) =>
          sendDecision({ action: 'DOWNSCOPE', justification: reason }, DECISION_SUCCESS)
        }
        onRevoke={(reason: string) =>
          sendDecision({ action: 'REVOKE', justification: reason }, DECISION_SUCCESS)
        }
      />

      {failure === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>
            {failure.message}
            {failure.detail === null ? null : (
              <span className="mt-1 block text-xs text-muted-foreground">{failure.detail}</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <h3 className="text-sm font-medium">Odrzuć odwołanie</h3>
        <p className="text-sm text-muted-foreground">
          Odrzucenie zamyka wniosek i zostawia dzierżawę bez zmian.
        </p>
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

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Zamknij
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
