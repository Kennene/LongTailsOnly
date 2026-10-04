import { useState } from 'react';
import { toast } from 'sonner';

import { DecisionKindSwitch } from '@/components/leases/DecisionKindSwitch';
import { DecisionModalAppeal } from '@/components/leases/DecisionModalAppeal';
import { DecisionSubject } from '@/components/leases/DecisionSubject';
import {
  buildExtension,
  CUSTOM_DAYS_ERROR,
  extensionBlockedReason,
  type ExtensionChoice,
} from '@/components/leases/extensionChoice';
import { ExtensionControls } from '@/components/leases/ExtensionControls';
import { FailureAlert } from '@/components/leases/FailureAlert';
import { JustificationField } from '@/components/leases/JustificationField';
import { LeaseActivityPanel } from '@/components/leases/LeaseActivityPanel';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { RecommendationBadge } from '@/components/leases/RecommendationBadge';
import { RoleBadge } from '@/components/leases/RoleBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLeaseDecision } from '@/hooks/useLeaseDecision';
import { useSimulatedClock } from '@/hooks/useSimulatedClock';
import { type ApiErrorDescription, describeEngineError } from '@/lib/apiErrors';
import { daysRemaining, formatDaysRemaining } from '@/lib/dateTime';
import type { AppealOverview, DecisionRequest, LeaseOverview } from '@/types/api';

export interface DecisionModalProps {
  lease: LeaseOverview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Odwołanie do rozpatrzenia (UC-3). Gdy podane, modal wchodzi w tryb odwołania i renderuje
   * `DecisionModalAppeal` — z zatwierdzeniem przedłużeniem albo decyzją o dzierżawie przez
   * `POST /api/v1/appeals/{id}/decision` i odrzuceniem przez `POST /api/v1/appeals/{id}/reject`.
   * Cały kontekst (osoba, repozytorium, rola, pozostałe dni) niesie `AppealOverview`, więc
   * dzierżawa nie jest wtedy potrzebna. Domyślnie `null` — ścieżka decyzji o dzierżawie bez zmian.
   */
  appeal?: AppealOverview | null;
}

const PAST_DATE_ERROR = 'Data musi być późniejsza niż czas symulowany';
const DECISION_FALLBACK = 'Nie udało się zapisać decyzji.';
const SUCCESS_MESSAGE = 'Decyzja zapisana';
/**
 * `decision_service._required` wymaga niepustego uzasadnienia przy `REVOKE` i `DOWNSCOPE`
 * (422), więc pole jest wspólne dla obu; `trim()` odsiewa też tekst z samych białych znaków.
 */
const JUSTIFICATION_REQUIRED = 'Uzasadnienie jest wymagane';

type LeaseDecisionKind = 'extend' | 'downscope' | 'revoke';

/** Etykieta głównego przycisku w stopce — zawsze mówi, co dokładnie się stanie. */
const SUBMIT_LABEL: Record<LeaseDecisionKind, string> = {
  extend: 'Przedłuż dostęp',
  downscope: 'Zdeeskaluj dostęp',
  revoke: 'Odbierz dostęp',
};

export function DecisionModal({
  lease,
  open,
  onOpenChange,
  appeal = null,
}: DecisionModalProps): React.JSX.Element {
  // Tryb odwołania nie potrzebuje dzierżawy; tryb dzierżawy nie rusza się bez niej.
  const isOpen: boolean = open && (appeal !== null || lease !== null);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* `key` czyści wybór i błędy przy każdej zmianie dzierżawy/odwołania i ponownym otwarciu. */}
      {isOpen && appeal !== null ? (
        <DecisionModalAppeal
          appeal={appeal}
          key={`appeal-${String(appeal.id)}`}
          onOpenChange={onOpenChange}
        />
      ) : null}
      {isOpen && appeal === null && lease !== null ? (
        <LeaseDecisionForm
          key={`lease-${String(lease.id)}`}
          lease={lease}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Dialog>
  );
}

interface LeaseDecisionFormProps {
  lease: LeaseOverview;
  onOpenChange: (open: boolean) => void;
}

/**
 * Tryb dzierżawy: decyzja idzie przez `POST /api/v1/leases/{id}/decision`.
 *
 * Układ od góry: kogo i czego dotyczy decyzja, stan dostępu w jednym rzędzie odznak, dowód użycia
 * w jednej linii, a pod spodem przełącznik **jednej** akcji (przedłuż / zdeeskaluj / odbierz)
 * z jej kontrolkami. Główny przycisk w stopce nazywa wybraną akcję; odebranie — jedyna akcja
 * nieodwracalna — wymaga jeszcze potwierdzenia drugim kliknięciem.
 */
function LeaseDecisionForm({ lease, onOpenChange }: LeaseDecisionFormProps): React.JSX.Element {
  const clock = useSimulatedClock();
  const decision = useLeaseDecision();
  const [kind, setKind] = useState<LeaseDecisionKind>('extend');
  const [choice, setChoice] = useState<ExtensionChoice | null>(null);
  const [customDays, setCustomDays] = useState<string>('');
  const [justification, setJustification] = useState<string>('');
  const [justificationError, setJustificationError] = useState<string | null>(null);
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState<boolean>(false);
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);

  const now: string | null = clock.data?.now ?? null;
  const isPending: boolean = decision.isPending;
  const extensionBlocked: string | null = extensionBlockedReason(lease);
  const kinds: { value: LeaseDecisionKind; label: string }[] = [
    { value: 'extend', label: 'Przedłuż' },
    // Silnik obniża wyłącznie zapis do odczytu (`downscope_lease`) — przy innym poziomie opcji nie ma.
    ...(lease.current_role === 'write'
      ? [{ value: 'downscope' as const, label: 'Zdeeskaluj' }]
      : []),
    { value: 'revoke', label: 'Odbierz' },
  ];

  function sendDecision(request: DecisionRequest): void {
    setFailure(null);
    decision.mutate(
      { lease_id: lease.id, request },
      {
        onSuccess: (): void => {
          toast.success(SUCCESS_MESSAGE);
          onOpenChange(false);
        },
        onError: (error: Error): void => {
          // Zdania po polsku trzyma wspólna tabela `describeEngineError`; angielski `detail`
          // silnika (m.in. droga wyjścia z konfliktu `PENDING` przez `/appeals`) idzie pod spód.
          setFailure(describeEngineError(error, 'LEASE_DECISION', DECISION_FALLBACK));
        },
      },
    );
  }

  function changeKind(next: LeaseDecisionKind): void {
    setKind(next);
    setIsConfirmingRevoke(false);
    setFailure(null);
  }

  function selectChoice(next: ExtensionChoice): void {
    setChoice(next);
    setFailure(null);
  }

  function handleCustomDaysChange(value: string): void {
    setCustomDays(value);
    selectChoice({ kind: 'custom' });
  }

  function handleJustificationChange(value: string): void {
    setJustification(value);
    setJustificationError(null);
  }

  /** Puste uzasadnienie zatrzymuje żądanie i pokazuje błąd przy polu — jak w `AppealForm`. */
  function confirmedJustification(): string | null {
    const trimmed: string = justification.trim();
    if (trimmed.length === 0) {
      setJustificationError(JUSTIFICATION_REQUIRED);
      return null;
    }

    setJustificationError(null);
    return trimmed;
  }

  function submitExtension(): void {
    if (choice === null) {
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

    sendDecision({ action: 'EXTEND', extension });
  }

  function handleSubmit(): void {
    if (isPending) {
      return;
    }
    if (kind === 'extend') {
      submitExtension();
      return;
    }
    if (kind === 'revoke' && !isConfirmingRevoke) {
      setIsConfirmingRevoke(true);
      return;
    }

    const reason: string | null = confirmedJustification();
    if (reason !== null) {
      sendDecision({ action: kind === 'revoke' ? 'REVOKE' : 'DOWNSCOPE', justification: reason });
    }
  }

  const isSubmitDisabled: boolean =
    isPending || (kind === 'extend' && (choice === null || extensionBlocked !== null));

  return (
    <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Decyzja o dostępie</DialogTitle>
        <DialogDescription>
          <DecisionSubject user={lease.user} repository={lease.repository} />
        </DialogDescription>
      </DialogHeader>

      {/* Stan dostępu w jednym rzędzie: poziom, status, termin i rada silnika. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <RoleBadge role={lease.current_role} />
        <LeaseStatusBadge status={lease.status} />
        <span className="text-muted-foreground">{formatDaysRemaining(lease.days_remaining)}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Rekomendacja</span>
          <RecommendationBadge recommendation={lease.recommendation} />
        </span>
      </div>

      <LeaseActivityPanel lease_id={lease.id} />

      <div className="flex flex-col gap-3 border-t pt-4">
        <DecisionKindSwitch options={kinds} value={kind} onChange={changeKind} />

        {kind === 'extend' ? (
          <ExtensionControls
            choice={choice}
            customDays={customDays}
            disabledReason={extensionBlocked}
            simulatedNow={now}
            onChoiceChange={selectChoice}
            onCustomDaysChange={handleCustomDaysChange}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {kind === 'revoke'
                ? 'Osoba straci dostęp do tego repozytorium.'
                : 'Zapis zmieni się w odczyt (read) na nowy okres dzierżawy.'}
            </p>
            <JustificationField
              id="decision-justification"
              label="Uzasadnienie"
              value={justification}
              error={justificationError}
              disabled={isPending}
              placeholder="Dlaczego — konkretnie i biznesowo."
              onChange={handleJustificationChange}
            />
          </>
        )}
      </div>

      {failure === null ? null : <FailureAlert failure={failure} />}

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
