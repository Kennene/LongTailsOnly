import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { DecisionActions } from '@/components/leases/DecisionActions';
import {
  buildExtension,
  CUSTOM_DAYS_ERROR,
  type ExtensionChoice,
} from '@/components/leases/extensionChoice';
import { ExtensionControls } from '@/components/leases/ExtensionControls';
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
import { getRecommendationLabel, getRoleLabel, getStatusBadge } from '@/lib/statusBadges';
import type { DecisionRequest, LeaseOverview } from '@/types/api';

export interface DecisionModalProps {
  lease: LeaseOverview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAST_DATE_ERROR = 'Data musi być późniejsza niż czas symulowany';
const LAST_ADMIN_ERROR = 'Nie można odebrać uprawnień ostatniemu administratorowi.';
const SUCCESS_MESSAGE = 'Decyzja zapisana';

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

  function handleCustomDaysChange(value: string): void {
    setCustomDays(value);
    selectChoice({ kind: 'custom' });
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

      <ExtensionControls
        choice={choice}
        customDays={customDays}
        simulatedNow={now}
        onChoiceChange={selectChoice}
        onCustomDaysChange={handleCustomDaysChange}
      />

      <DecisionActions
        currentRole={lease.current_role}
        isPending={decision.isPending}
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
        <Button disabled={choice === null || decision.isPending} onClick={handleSubmit}>
          Zatwierdź decyzję
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
