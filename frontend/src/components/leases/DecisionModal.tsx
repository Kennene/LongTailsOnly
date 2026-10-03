import { useState } from 'react';
import { toast } from 'sonner';

import { DecisionActions } from '@/components/leases/DecisionActions';
import { DecisionModalAppeal } from '@/components/leases/DecisionModalAppeal';
import {
  buildExtension,
  CUSTOM_DAYS_ERROR,
  extensionBlockedReason,
  type ExtensionChoice,
} from '@/components/leases/extensionChoice';
import { ExtensionControls } from '@/components/leases/ExtensionControls';
import { LeaseActivityPanel } from '@/components/leases/LeaseActivityPanel';
import { LeaseStatusBadge } from '@/components/leases/LeaseStatusBadge';
import { RecommendationBadge } from '@/components/leases/RecommendationBadge';
import { RoleBadge } from '@/components/leases/RoleBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

/** Tryb dzierżawy: decyzja idzie przez `POST /api/v1/leases/{id}/decision`. */
function LeaseDecisionForm({ lease, onOpenChange }: LeaseDecisionFormProps): React.JSX.Element {
  const clock = useSimulatedClock();
  const decision = useLeaseDecision();
  const [choice, setChoice] = useState<ExtensionChoice | null>(null);
  const [customDays, setCustomDays] = useState<string>('');
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);

  const now: string | null = clock.data?.now ?? null;
  const isPending: boolean = decision.isPending;
  const extensionBlocked: string | null = extensionBlockedReason(lease);

  function sendDecision(request: DecisionRequest): void {
    setFailure(null);
    const callbacks = {
      onSuccess: (): void => {
        toast.success(SUCCESS_MESSAGE);
        onOpenChange(false);
      },
      onError: (error: Error): void => {
        // Zdania po polsku trzyma wspólna tabela `describeEngineError`; angielski `detail`
        // silnika (m.in. droga wyjścia z konfliktu `PENDING` przez `/appeals`) idzie pod spód.
        setFailure(describeEngineError(error, 'LEASE_DECISION', DECISION_FALLBACK));
      },
    };

    decision.mutate({ lease_id: lease.id, request }, callbacks);
  }

  function selectChoice(next: ExtensionChoice): void {
    setChoice(next);
    setFailure(null);
  }

  function handleCustomDaysChange(value: string): void {
    setCustomDays(value);
    selectChoice({ kind: 'custom' });
  }

  function handleSubmit(): void {
    if (choice === null || isPending) {
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

  return (
    // Modal jest dłuższy niż niski ekran (laptop 1366×768, telefon): bez sufitu wysokości Radix
    // centruje go poza krawędziami i tytuł oraz akcje stają się nieosiągalne. Treść przewija się
    // w środku, a stopka z akcjami zostaje przyklejona do dolnej krawędzi. `pb-0` + `mb-0`, bo
    // w kontenerze przewijanym dolny padding ląduje za stopką i zostawiał pod nią 16 px pustki.
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto pb-0 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Decyzja o dostępie</DialogTitle>
        <DialogDescription>{`${lease.user.name} (${lease.user.login})`}</DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Repozytorium</dt>
        <dd className="font-mono">{`${lease.repository.owner}/${lease.repository.name}`}</dd>
        <dt className="text-muted-foreground">Rola</dt>
        <dd>
          <RoleBadge role={lease.current_role} />
        </dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <LeaseStatusBadge status={lease.status} />
        </dd>
        <dt className="text-muted-foreground">Czas do wygaśnięcia</dt>
        <dd>{formatDaysRemaining(lease.days_remaining)}</dd>
        <dt className="text-muted-foreground">Rekomendacja</dt>
        <dd>
          <RecommendationBadge recommendation={lease.recommendation} />
        </dd>
      </dl>

      <LeaseActivityPanel lease_id={lease.id} />

      <ExtensionControls
        choice={choice}
        customDays={customDays}
        disabledReason={extensionBlocked}
        simulatedNow={now}
        onChoiceChange={selectChoice}
        onCustomDaysChange={handleCustomDaysChange}
      />

      <DecisionActions
        currentRole={lease.current_role}
        isPending={isPending}
        onRevoke={(justification: string) => sendDecision({ action: 'REVOKE', justification })}
        onDownscope={(justification: string) =>
          sendDecision({ action: 'DOWNSCOPE', justification })
        }
      />

      {failure !== null ? (
        <Alert variant="destructive">
          <AlertDescription>
            {failure.message}
            {failure.detail === null ? null : (
              <span className="mt-1 block text-xs text-muted-foreground">{failure.detail}</span>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter className="sticky bottom-0 mb-0 bg-popover">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Zamknij
        </Button>
        <Button disabled={choice === null || isPending} onClick={handleSubmit}>
          Zatwierdź decyzję
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
