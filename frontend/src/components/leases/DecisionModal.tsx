import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { DecisionActions } from '@/components/leases/DecisionActions';
import { DecisionModalAppeal } from '@/components/leases/DecisionModalAppeal';
import {
  buildExtension,
  CUSTOM_DAYS_ERROR,
  type ExtensionChoice,
} from '@/components/leases/extensionChoice';
import { ExtensionControls } from '@/components/leases/ExtensionControls';
import { LeaseActivityPanel } from '@/components/leases/LeaseActivityPanel';
import { RecommendationBadge } from '@/components/leases/RecommendationBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { daysRemaining, formatDaysRemaining } from '@/lib/dateTime';
import { getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import type { AppealOverview, DecisionRequest, LeaseOverview } from '@/types/api';

export interface DecisionModalProps {
  lease: LeaseOverview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Odwołanie do rozpatrzenia (UC-3). Gdy podane, modal wchodzi w tryb odwołania i renderuje
   * `DecisionModalAppeal` — z odrzuceniem przez `POST /api/v1/appeals/{id}/reject`. Cały kontekst
   * (osoba, repozytorium, rola, pozostałe dni) niesie `AppealOverview`, więc dzierżawa nie jest
   * wtedy potrzebna. Domyślnie `null` — ścieżka decyzji o dzierżawie bez zmian.
   */
  appeal?: AppealOverview | null;
}

const PAST_DATE_ERROR = 'Data musi być późniejsza niż czas symulowany';
const LAST_ADMIN_ERROR = 'Nie można odebrać uprawnień ostatniemu administratorowi.';
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
  const [error, setError] = useState<string | null>(null);

  const now: string | null = clock.data?.now ?? null;
  const statusBadge = getStatusBadge(lease.status);
  const isPending: boolean = decision.isPending;

  function sendDecision(request: DecisionRequest): void {
    setError(null);
    const callbacks = {
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
    };

    decision.mutate({ lease_id: lease.id, request }, callbacks);
  }

  function selectChoice(next: ExtensionChoice): void {
    setChoice(next);
    setError(null);
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
        <dd>
          <RecommendationBadge recommendation={lease.recommendation} />
        </dd>
      </dl>

      <LeaseActivityPanel lease_id={lease.id} />

      <ExtensionControls
        choice={choice}
        customDays={customDays}
        simulatedNow={now}
        onChoiceChange={selectChoice}
        onCustomDaysChange={handleCustomDaysChange}
      />

      <DecisionActions
        currentRole={lease.current_role}
        isPending={isPending}
        onRevoke={() => sendDecision({ action: 'REVOKE' })}
        onDownscope={() => sendDecision({ action: 'DOWNSCOPE' })}
      />

      {error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
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
