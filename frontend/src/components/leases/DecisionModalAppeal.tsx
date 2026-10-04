import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { AppealStatusBadge } from '@/components/appeals/AppealStatusBadge';
import { AppealContextPanel } from '@/components/leases/AppealContextPanel';
import { DECISION_PANEL_HEIGHT, DecisionKindSwitch } from '@/components/leases/DecisionKindSwitch';
import { DecisionSubject } from '@/components/leases/DecisionSubject';
import { buildExtension, CUSTOM_DAYS_ERROR } from '@/components/leases/extensionChoice';
import { ExtensionControls } from '@/components/leases/ExtensionControls';
import { FailureAlert } from '@/components/leases/FailureAlert';
import { JustificationField } from '@/components/leases/JustificationField';
import { RoleBadge } from '@/components/leases/RoleBadge';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDecideAppeal } from '@/hooks/useDecideAppeal';
import { useRejectAppeal } from '@/hooks/useRejectAppeal';
import { type ApiErrorDescription, describeApiError, describeEngineError } from '@/lib/apiErrors';
import { formatDaysRemaining } from '@/lib/dateTime';
import { cn } from '@/lib/utils';
import type { AppealOverview, DecisionRequest } from '@/types/api';

export interface DecisionModalAppealProps {
  appeal: AppealOverview;
  onOpenChange: (open: boolean) => void;
}

const REJECTION_REQUIRED = 'Uzasadnienie odrzucenia jest wymagane';
const DECISION_REQUIRED = 'Uzasadnienie jest wymagane';
const REJECTION_SUCCESS = 'Odwołanie odrzucone';
const APPROVAL_SUCCESS = 'Odwołanie zatwierdzone';
const DECISION_SUCCESS = 'Decyzja zapisana';
const DECISION_FALLBACK = 'Nie udało się zapisać decyzji o dostępie.';
const ALREADY_RESOLVED = 'To odwołanie zostało już rozstrzygnięte.';

type AppealDecisionKind = 'approve' | 'reject' | 'downscope' | 'revoke';

/** Etykieta głównego przycisku w stopce — zawsze mówi, co dokładnie się stanie. */
const SUBMIT_LABEL: Record<AppealDecisionKind, string> = {
  approve: 'Zatwierdź odwołanie',
  reject: 'Odrzuć odwołanie',
  downscope: 'Zdeeskaluj dostęp',
  revoke: 'Odbierz dostęp',
};

/** Jedno zdanie pod przełącznikiem: co ta droga zrobi z wnioskiem i z dostępem. */
const KIND_HINT: Record<AppealDecisionKind, string> = {
  approve: 'Przedłuża dostęp o wybrany okres i zamyka wniosek.',
  reject: 'Zamyka wniosek, dostęp zostaje bez zmian.',
  downscope: 'Zmienia zapis w odczyt (read) i zamyka wniosek odrzuceniem.',
  revoke: 'Odbiera dostęp do repozytorium i zamyka wniosek odrzuceniem.',
};

/**
 * Zdanie po polsku dla błędu decyzji o dostępie.
 *
 * `409` z tego endpointu to wniosek rozstrzygnięty już wcześniej (`appeal_service.pending_appeal`),
 * a nie powtórzone uzasadnienie ani cudzy dostęp — `describeEngineError` nie ma reguły na ten
 * komunikat i pokazałby angielski `detail` jako zdanie główne. Reszta (403 ostatniego admina,
 * 422 silnika) idzie wspólną tabelą `LEASE_DECISION`, bo to ta sama decyzja co w widoku dostępów.
 */
function describeDecisionError(error: Error): ApiErrorDescription {
  if (error instanceof ApiError && error.status === 409) {
    return { message: ALREADY_RESOLVED, detail: error.message };
  }

  return describeEngineError(error, 'LEASE_DECISION', DECISION_FALLBACK);
}

/**
 * Rozpatrzenie odwołania (UC-3). Osoba, repozytorium, rola i pozostałe dni pochodzą
 * z `AppealOverview`, więc modal **nie potrzebuje** propa `lease` ani listy dostępów.
 *
 * Układ jak w decyzji o dostępie: kto i czego dotyczy wniosek, stan w jednym rzędzie, kontekst
 * (uzasadnienie, aktywność, historia), a pod spodem przełącznik **jednej** drogi:
 *
 * - „Zatwierdź” → `POST /api/v1/appeals/{id}/decision` z `EXTEND` i wybranym przedłużeniem:
 *   backend przedłuża dostęp i zamyka wniosek jako `APPROVED`,
 * - „Odrzuć” → `POST /api/v1/appeals/{id}/reject`: wniosek zamyka się bez zmian w dostępie,
 * - „Zdeeskaluj” / „Odbierz” → ten sam `/decision` z `DOWNSCOPE`/`REVOKE` (uzasadnienie wymagane
 *   przez silnik, 422 bez niego): dostęp traci uprawnienia, a wniosek zamyka się odrzuceniem.
 */
export function DecisionModalAppeal({
  appeal,
  onOpenChange,
}: DecisionModalAppealProps): React.JSX.Element {
  const rejection = useRejectAppeal();
  const decision = useDecideAppeal();
  const [kind, setKind] = useState<AppealDecisionKind>('approve');
  const [days, setDays] = useState<string>('');
  const [rejectionText, setRejectionText] = useState<string>('');
  const [decisionText, setDecisionText] = useState<string>('');
  // Tylko walidacja lokalna; błędy API lądują w `FailureAlert` pod formularzem.
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState<boolean>(false);
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);

  const isPending: boolean = decision.isPending || rejection.isPending;
  const kinds: { value: AppealDecisionKind; label: string }[] = [
    { value: 'approve', label: 'Zatwierdź' },
    { value: 'reject', label: 'Odrzuć' },
    // Silnik obniża wyłącznie zapis do odczytu (`downscope_lease`) — przy innym poziomie opcji nie ma.
    ...(appeal.lease_role === 'write'
      ? [{ value: 'downscope' as const, label: 'Zdeeskaluj' }]
      : []),
    { value: 'revoke', label: 'Odbierz' },
  ];

  function changeKind(next: AppealDecisionKind): void {
    setKind(next);
    setValidationError(null);
    setIsConfirmingRevoke(false);
    setFailure(null);
  }

  function handleDaysChange(value: string): void {
    setDays(value);
    setFailure(null);
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

  function submitApproval(): void {
    const extension = buildExtension(days);
    if (extension === null) {
      setFailure({ message: CUSTOM_DAYS_ERROR, detail: null });
      return;
    }

    sendDecision({ action: 'EXTEND', extension }, APPROVAL_SUCCESS);
  }

  function submitRejection(): void {
    const trimmed: string = rejectionText.trim();
    if (trimmed.length === 0) {
      setValidationError(REJECTION_REQUIRED);
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

  function submitLeaseChange(): void {
    const trimmed: string = decisionText.trim();
    if (trimmed.length === 0) {
      setValidationError(DECISION_REQUIRED);
      return;
    }

    setValidationError(null);
    sendDecision(
      { action: kind === 'revoke' ? 'REVOKE' : 'DOWNSCOPE', justification: trimmed },
      DECISION_SUCCESS,
    );
  }

  function handleSubmit(): void {
    if (isPending) {
      return;
    }
    switch (kind) {
      case 'approve':
        submitApproval();
        return;
      case 'reject':
        submitRejection();
        return;
      case 'revoke':
        // Odebranie jest jedyną akcją nieodwracalną — pierwszy klik tylko prosi o potwierdzenie.
        if (!isConfirmingRevoke) {
          setIsConfirmingRevoke(true);
          return;
        }
        submitLeaseChange();
        return;
      case 'downscope':
        submitLeaseChange();
        return;
    }
  }

  const isSubmitDisabled: boolean = isPending || (kind === 'approve' && days.trim() === '');

  return (
    <DialogContent className="max-h-[90vh] gap-6 overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Rozpatrzenie odwołania</DialogTitle>
        <DialogDescription>
          <DecisionSubject user={appeal.user} repository={appeal.repository} />
        </DialogDescription>
      </DialogHeader>

      {/* Stan wniosku w jednym rzędzie: co osoba ma, o co prosi, status i termin dostępu. */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm"
        data-testid="appeal-lease-context"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Ma</span>
          <RoleBadge role={appeal.lease_role} />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Prosi o</span>
          <RoleBadge role={appeal.requested_role} />
        </span>
        <AppealStatusBadge status={appeal.status} />
        <span className="text-muted-foreground">
          {appeal.lease_is_active
            ? formatDaysRemaining(appeal.days_remaining)
            : 'Dostęp nieaktywny'}
        </span>
        <span className="text-xs text-muted-foreground">
          {`Poprzednie odwołania: ${String(appeal.previous_appeals)}`}
        </span>
      </div>

      <AppealContextPanel appeal={appeal} />

      <div className="flex flex-col gap-3 border-t pt-4">
        <DecisionKindSwitch options={kinds} value={kind} onChange={changeKind} />
        <div
          className={cn('flex flex-col gap-3', DECISION_PANEL_HEIGHT)}
          data-testid="decision-panel"
        >
          <p className="text-center text-sm text-muted-foreground">{KIND_HINT[kind]}</p>

          {kind === 'approve' ? (
            <ExtensionControls days={days} onDaysChange={handleDaysChange} />
          ) : null}
          {kind === 'reject' ? (
            <JustificationField
              id="appeal-rejection-justification"
              label="Uzasadnienie odrzucenia"
              value={rejectionText}
              error={validationError}
              disabled={isPending}
              placeholder="Dlaczego wniosek nie zasługuje na przedłużenie dostępu."
              onChange={(value: string): void => {
                setRejectionText(value);
                setValidationError(null);
              }}
            />
          ) : null}
          {kind === 'downscope' || kind === 'revoke' ? (
            <JustificationField
              id="decision-justification"
              label="Uzasadnienie"
              value={decisionText}
              error={validationError}
              disabled={isPending}
              placeholder="Dlaczego — konkretnie i biznesowo."
              onChange={(value: string): void => {
                setDecisionText(value);
                setValidationError(null);
              }}
            />
          ) : null}
        </div>
      </div>

      {failure === null ? null : <FailureAlert failure={failure} />}
      {rejection.error === null ? null : (
        <FailureAlert
          failure={{
            message: describeApiError(rejection.error, 'Nie udało się odrzucić odwołania.'),
            detail: null,
          }}
        />
      )}

      <DialogFooter>
        {isConfirmingRevoke ? (
          <>
            <Button variant="outline" onClick={() => setIsConfirmingRevoke(false)}>
              Zostaw dostęp
            </Button>
            <Button variant="destructive" disabled={isPending} onClick={handleSubmit}>
              Potwierdzam odebranie
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Zamknij
            </Button>
            <Button
              variant={kind === 'revoke' ? 'destructive' : 'default'}
              disabled={isSubmitDisabled}
              onClick={handleSubmit}
            >
              {SUBMIT_LABEL[kind]}
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
