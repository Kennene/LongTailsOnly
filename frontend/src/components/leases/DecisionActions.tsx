import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Role } from '@/types/api';

export interface DecisionActionsProps {
  currentRole: Role;
  isPending: boolean;
  onRevoke: () => void;
  onDownscope: () => void;
}

export function DecisionActions({
  currentRole,
  isPending,
  onRevoke,
  onDownscope,
}: DecisionActionsProps): React.JSX.Element {
  const [isConfirmingRevoke, setIsConfirmingRevoke] = useState<boolean>(false);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-medium">Odbierz dostęp</h3>
      <div className="flex flex-wrap gap-1.5">
        {isConfirmingRevoke ? (
          <>
            <Button variant="destructive" size="sm" disabled={isPending} onClick={onRevoke}>
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
          <Button variant="secondary" size="sm" disabled={isPending} onClick={onDownscope}>
            Zdeeskaluj
          </Button>
        ) : null}
      </div>
    </section>
  );
}
