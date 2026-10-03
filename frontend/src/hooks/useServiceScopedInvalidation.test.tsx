import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appealsFixture } from '@/api/fixtures';
import { useLeaseDecision } from '@/hooks/useLeaseDecision';
import { useRejectAppeal } from '@/hooks/useRejectAppeal';
import { resetAppealsMswState } from '@/test/msw/domains/appeals';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AppealOverview } from '@/types/api';

/**
 * Unieważnienia po mutacjach niosą prefiks **aktywnej usługi** (`['appeals', <id usługi>]`), bo
 * tylko ta usługa ma te dane w cache. Zadanie 10 domyka tutaj dwa braki z przeglądu zadania 8:
 *
 * - `useRejectAppeal` był **jedynym inwalidatorem bez pinu**, a jednym z trzech hooków dodanych przy
 *   rebase'ie, których goły klucz był ryzykiem nazwanym wprost — ten plik pinuje jego trzy prefiksy
 *   tak samo, jak `useServiceScopedKeys.test.tsx` pinuje `useSubmitAppeal`,
 * - przypadek `useLeaseDecision` biegł z zapisanym `demo-tracker` — dokładnie tą wartością, której
 *   użyłby zaszyty na twardo prefiks, więc twardego kodu nie dało się tam wykryć.
 *
 * Osobny plik, a nie dopisanie do `useServiceScopedKeys.test.tsx`: tamten ma 262 z 300 linii
 * objętych regułą `max-lines` (`skipBlankLines`/`skipComments`).
 */

const STORAGE_KEY = 'lease-governor.service';
const DEMO_TRACKER = 'demo-tracker';
const GITHUB = 'github';
const LEASE_ID = 1;
const JUSTIFICATION = 'Odrzucam wniosek: brak pokrycia w budżecie zespołu';
const REJECT_APPEAL_LABEL = 'Odrzuć odwołanie';
const DECIDE_LABEL = 'Rozstrzygnij';

/** Wniosek `PENDING` z fixture'u — odrzucenie musi się udać, żeby `onSuccess` w ogóle zaszedł. */
const APPEAL_ID: number =
  appealsFixture.find((appeal: AppealOverview): boolean => appeal.status === 'PENDING')?.id ?? 0;

function RejectAppealProbe(): React.JSX.Element {
  const rejectAppeal = useRejectAppeal();

  return (
    <button
      type="button"
      onClick={() => rejectAppeal.mutate({ appeal_id: APPEAL_ID, justification: JUSTIFICATION })}
    >
      {REJECT_APPEAL_LABEL}
    </button>
  );
}

function DecisionProbe(): React.JSX.Element {
  const decision = useLeaseDecision();

  return (
    <button
      type="button"
      onClick={() =>
        decision.mutate({
          lease_id: LEASE_ID,
          request: { action: 'DOWNSCOPE', justification: JUSTIFICATION },
        })
      }
    >
      {DECIDE_LABEL}
    </button>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetAppealsMswState();
});

describe('service-scoped invalidation', () => {
  it('invalidates the appeal prefixes of the active service after rejecting an appeal', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, DEMO_TRACKER);
    const { queryClient } = renderWithProviders(<RejectAppealProbe />);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: REJECT_APPEAL_LABEL }));

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['appeals', DEMO_TRACKER] });
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard', DEMO_TRACKER] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audit', DEMO_TRACKER] });
    // Goły prefiks unieważniłby dane **wszystkich** usług — to nie jest kontrakt tego zadania.
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['appeals'] });
    // Dzierżawy zostają w spokoju: odrzucenie wniosku nic w nich nie zmienia.
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['leases', DEMO_TRACKER] });
  });

  it('derives the decision invalidation prefix from the active service, not a literal', async () => {
    // `demo-tracker` to dokładnie ta wartość, której użyłby zaszyty na twardo prefiks, więc
    // rozstrzygamy pod `github` — hardkod `'demo-tracker'` musi tu paść na każdej z pięciu osi.
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, GITHUB);
    const { queryClient } = renderWithProviders(<DecisionProbe />);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: DECIDE_LABEL }));

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['leases', GITHUB] });
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dashboard', GITHUB] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audit', GITHUB] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['appeals', GITHUB] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['graph', GITHUB] });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['leases', DEMO_TRACKER] });
  });
});
