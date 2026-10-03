import { type ChangeEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Role } from '@/types/api';

export interface DecisionActionsProps {
  currentRole: Role;
  isPending: boolean;
  /** Wołane wyłącznie z niepustym, przyciętym uzasadnieniem — silnik odrzuca puste (`422`). */
  onRevoke: (justification: string) => void;
  onDownscope: (justification: string) => void;
}

/**
 * Komunikat walidacji; `trim()` odsiewa też uzasadnienie z samych białych znaków.
 * `decision_service._required` wymaga niepustego uzasadnienia przy `REVOKE` i `DOWNSCOPE`
 * (422 `A justification is required to downscope or revoke access`), więc pole jest wspólne
 * dla obu akcji niszczących — jedno uzasadnienie, zero dodatkowych kroków.
 */
const JUSTIFICATION_REQUIRED = 'Uzasadnienie jest wymagane';

export function DecisionActions({
  currentRole,
  isPending,
  onRevoke,
  onDownscope,
}: DecisionActionsProps): React.JSX.Element {
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState<boolean>(false);
  const [justification, setJustification] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  /** Puste uzasadnienie zatrzymuje żądanie i pokazuje błąd przy polu — jak w `AppealForm`. */
  function confirmedJustification(): string | null {
    const trimmed: string = justification.trim();
    if (trimmed.length === 0) {
      setError(JUSTIFICATION_REQUIRED);
      return null;
    }

    setError(null);
    return trimmed;
  }

  function handleRevoke(): void {
    const reason: string | null = confirmedJustification();
    if (reason !== null) {
      onRevoke(reason);
    }
  }

  function handleDownscope(): void {
    const reason: string | null = confirmedJustification();
    if (reason !== null) {
      onDownscope(reason);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-medium">Odbierz dostęp</h3>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-justification">Uzasadnienie</Label>
        <Textarea
          aria-describedby={error === null ? undefined : 'decision-justification-error'}
          aria-invalid={error !== null}
          className="min-h-20"
          disabled={isPending}
          id="decision-justification"
          onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
            setJustification(event.target.value);
            setError(null);
          }}
          placeholder="Dlaczego dostęp ma zostać odebrany albo zdeeskalowany — konkretnie i biznesowo."
          value={justification}
        />
        {error === null ? null : (
          <p
            className="text-xs text-status-expired-foreground"
            id="decision-justification-error"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {isConfirmingRevoke ? (
          <>
            <Button variant="destructive" size="sm" disabled={isPending} onClick={handleRevoke}>
              Potwierdzam wyłączenie
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsConfirmingRevoke(false)}>
              Zostaw dostęp
            </Button>
          </>
        ) : (
          <Button variant="destructive" size="sm" onClick={() => setIsConfirmingRevoke(true)}>
            Wyłącz
          </Button>
        )}
        {currentRole !== 'read' ? (
          <Button variant="secondary" size="sm" disabled={isPending} onClick={handleDownscope}>
            Zdeeskaluj
          </Button>
        ) : null}
      </div>
    </section>
  );
}
