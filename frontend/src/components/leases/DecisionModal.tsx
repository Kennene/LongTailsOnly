import { useState } from 'react';
import { toast } from 'sonner';

import {
  DECISION_PANEL_HEIGHT,
  DecisionKindSwitch,
  FOOTER_PRIMARY_WIDTH,
  FOOTER_SECONDARY_WIDTH,
} from '@/components/leases/DecisionKindSwitch';
import { DecisionModalAppeal } from '@/components/leases/DecisionModalAppeal';
import { DecisionSubject } from '@/components/leases/DecisionSubject';
import {
  buildExtension,
  CUSTOM_DAYS_ERROR,
  extensionBlockedReason,
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
import { type ApiErrorDescription, describeEngineError } from '@/lib/apiErrors';
import { formatDaysRemaining } from '@/lib/dateTime';
import { cn } from '@/lib/utils';
import type { AppealOverview, DecisionRequest, LeaseOverview } from '@/types/api';

export interface DecisionModalProps {
  lease: LeaseOverview | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Odwołanie do rozpatrzenia (UC-3). Gdy podane, modal wchodzi w tryb odwołania i renderuje
   * `DecisionModalAppeal` — z zatwierdzeniem przedłużeniem albo decyzją o dostępie przez
   * `POST /api/v1/appeals/{id}/decision` i odrzuceniem przez `POST /api/v1/appeals/{id}/reject`.
   * Cały kontekst (osoba, repozytorium, rola, pozostałe dni) niesie `AppealOverview`, więc
   * dostęp nie jest wtedy potrzebny. Domyślnie `null` — ścieżka decyzji o dostępie bez zmian.
   */
  appeal?: AppealOverview | null;
}

const DECISION_FALLBACK = 'Nie udało się zapisać decyzji.';
const SUCCESS_MESSAGE = 'Decyzja zapisana';
/**
 * `decision_service._required` wymaga niepustego uzasadnienia przy `REVOKE` i `DOWNSCOPE`
 * (422), więc pole jest wspólne dla obu; `trim()` odsiewa też tekst z samych białych znaków.
 */
const JUSTIFICATION_REQUIRED = 'Uzasadnienie jest wymagane';

type LeaseDecisionKind = 'extend' | 'downscope' | 'revoke';

/** Etykieta głównego przycisku w stopce — zawsze mówi, co dokładnie się stanie. */
/** Jedno zdanie pod przełącznikiem: co wybrana akcja zrobi z dostępem. */
const KIND_HINT: Record<LeaseDecisionKind, string> = {
  extend: 'Przedłuża dostęp o podaną liczbę dni.',
  downscope: 'Zapis zmieni się w odczyt (read) na nowy okres dostępu.',
  revoke: 'Osoba straci dostęp do tego repozytorium.',
};

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
  // Tryb odwołania nie potrzebuje dostępu; tryb dostępu nie rusza się bez niego.
  const isOpen: boolean = open && (appeal !== null || lease !== null);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {/* `key` czyści wybór i błędy przy każdej zmianie dostępu/odwołania i ponownym otwarciu. */}
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
 * Tryb dostępu: decyzja idzie przez `POST /api/v1/leases/{id}/decision`.
 *
 * Układ od góry: kogo i czego dotyczy decyzja, stan dostępu w jednym rzędzie odznak, dowód użycia
 * w jednej linii, a pod spodem przełącznik **jednej** akcji (przedłuż / zdeeskaluj / odbierz)
 * z jej kontrolkami. Główny przycisk w stopce nazywa wybraną akcję; odebranie — jedyna akcja
 * nieodwracalna — wymaga jeszcze potwierdzenia drugim kliknięciem.
 */
function LeaseDecisionForm({ lease, onOpenChange }: LeaseDecisionFormProps): React.JSX.Element {
  const decision = useLeaseDecision();
  const [kind, setKind] = useState<LeaseDecisionKind>('extend');
  const [days, setDays] = useState<string>('');
  const [justification, setJustification] = useState<string>('');
  const [justificationError, setJustificationError] = useState<string | null>(null);
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState<boolean>(false);
  const [failure, setFailure] = useState<ApiErrorDescription | null>(null);

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

  function handleDaysChange(value: string): void {
    setDays(value);
    setFailure(null);
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
    const extension = buildExtension(days);
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
    isPending || (kind === 'extend' && (days.trim() === '' || extensionBlocked !== null));

  return (
    <DialogContent className="max-h-[90vh] gap-6 overflow-y-auto sm:max-w-2xl">
      <DialogHeader className="items-center text-center">
        <DialogTitle className="text-xl">Decyzja o dostępie</DialogTitle>
        <DialogDescription>
          <DecisionSubject user={lease.user} repository={lease.repository} />
        </DialogDescription>
      </DialogHeader>

      {/* Stan dostępu w jednym rzędzie: poziom, status i termin. */}
      <div
        className="flex flex-wrap items-center justify-center gap-3 text-sm"
        data-testid="lease-state"
      >
        <RoleBadge role={lease.current_role} />
        <LeaseStatusBadge status={lease.status} />
        <span className="text-muted-foreground">{formatDaysRemaining(lease.days_remaining)}</span>
      </div>

      <LeaseActivityPanel lease_id={lease.id} />

      <div className="flex flex-col gap-3 border-t pt-4">
        {/* Rada silnika stoi przy decyzji, nie w rzędzie stanu — tam zlewała się z odznakami. */}
        <p
          className="flex items-center justify-center gap-2 text-base text-muted-foreground"
          data-testid="lease-recommendation"
        >
          Rekomendacja silnika
          <RecommendationBadge recommendation={lease.recommendation} className="h-7 px-3 text-sm" />
        </p>
        <DecisionKindSwitch options={kinds} value={kind} onChange={changeKind} />

        <div
          className={cn('flex flex-col justify-center gap-3', DECISION_PANEL_HEIGHT)}
          data-testid="decision-panel"
        >
          <p className="text-center text-sm text-muted-foreground">{KIND_HINT[kind]}</p>
          {kind === 'extend' ? (
            <ExtensionControls
              days={days}
              disabledReason={extensionBlocked}
              onDaysChange={handleDaysChange}
            />
          ) : (
            <JustificationField
              id="decision-justification"
              label="Uzasadnienie"
              value={justification}
              error={justificationError}
              disabled={isPending}
              placeholder="Dlaczego — konkretnie i biznesowo."
              onChange={handleJustificationChange}
            />
          )}
        </div>
      </div>

      {failure === null ? null : <FailureAlert failure={failure} />}

      <DialogFooter>
        {isConfirmingRevoke ? (
          <>
            <Button
              variant="outline"
              className={FOOTER_SECONDARY_WIDTH}
              onClick={() => setIsConfirmingRevoke(false)}
            >
              Zostaw dostęp
            </Button>
            <Button
              variant="destructive"
              className={FOOTER_PRIMARY_WIDTH}
              disabled={isPending}
              onClick={handleSubmit}
            >
              Potwierdzam odebranie
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className={FOOTER_SECONDARY_WIDTH}
              onClick={() => onOpenChange(false)}
            >
              Zamknij
            </Button>
            <Button
              variant={kind === 'revoke' ? 'destructive' : 'default'}
              className={FOOTER_PRIMARY_WIDTH}
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
