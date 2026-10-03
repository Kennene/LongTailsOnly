import { type ChangeEvent, type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SELECT_CLASSES } from '@/lib/selectClasses';
import { getRoleLabel } from '@/lib/statusBadges';
import { cn } from '@/lib/utils';
import type { LeaseOverview } from '@/types/api';

export interface AppealFormProps {
  leases: LeaseOverview[];
  onSubmit: (lease_id: number, justification: string) => void;
  /** Blokuje ponowne wysłanie, gdy mutacja jest w toku (drugi POST kończy się konfliktem 409). */
  isSubmitting?: boolean;
}

/** Komunikat walidacji; `trim()` odsiewa też uzasadnienie z samych białych znaków. */
const JUSTIFICATION_REQUIRED = 'Uzasadnienie jest wymagane';

export function AppealForm({
  leases,
  onSubmit,
  isSubmitting = false,
}: AppealFormProps): React.JSX.Element {
  const [leaseId, setLeaseId] = useState<string>(leases.length === 0 ? '' : String(leases[0].id));
  const [justification, setJustification] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedJustification: string = justification.trim();

    if (trimmedJustification.length === 0) {
      setError(JUSTIFICATION_REQUIRED);
      return;
    }

    setError(null);
    onSubmit(Number(leaseId), trimmedJustification);
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="appeal-lease">Dostęp</Label>
        <select
          // Natywny `<select>`: jest w pełni dostępny bez JS, a Radixowy `Select` z `components/ui`
          // nie przyjmuje `userEvent.selectOptions` (plan testów 5.8a) i wymaga polyfilli w jsdom.
          // `SELECT_CLASSES` to wspólny rdzeń (spec §6), a `px-2`, `w-full` i `disabled:*` — różnice
          // tego pola.
          className={cn(
            SELECT_CLASSES,
            'w-full px-2 disabled:cursor-not-allowed disabled:opacity-50',
          )}
          id="appeal-lease"
          onChange={(event: ChangeEvent<HTMLSelectElement>): void => setLeaseId(event.target.value)}
          value={leaseId}
        >
          {leases.map((lease: LeaseOverview): React.JSX.Element => (
            <option key={lease.id} value={lease.id}>
              {`${lease.user.name} — ${lease.repository.name} (${getRoleLabel(lease.current_role)})`}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="appeal-justification">Uzasadnienie</Label>
        <Textarea
          aria-describedby={error === null ? undefined : 'appeal-justification-error'}
          aria-invalid={error !== null}
          className="min-h-24"
          id="appeal-justification"
          onChange={(event: ChangeEvent<HTMLTextAreaElement>): void =>
            setJustification(event.target.value)
          }
          placeholder="Po co dostęp ma zostać przedłużony — konkretnie i biznesowo."
          value={justification}
        />
        {error === null ? null : (
          <p
            className="text-xs text-status-expired-foreground"
            id="appeal-justification-error"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      <Button className="self-start" disabled={isSubmitting} type="submit">
        Złóż odwołanie
      </Button>
    </form>
  );
}
