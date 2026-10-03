import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchActivityStats } from '@/api/activity';
import { fetchAppeals, rejectAppeal } from '@/api/appeals';
import { appealsFixture, leasesFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import {
  bindAppealToLease,
  getLastAppealDecision,
  getLastAppealRejection,
  getLastAppealRequest,
  resetAppealsMswState,
} from '@/test/msw/domains/appeals';
import { getLastDecisionRequest } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AppealOverview, LeaseOverview } from '@/types/api';

/**
 * Tryb odwołania modala decyzji (UC-3).
 *
 * Backend rozstrzyga wniosek dwiema drogami (`backend/app/api/v1/appeals.py`):
 * `POST /api/v1/appeals/{id}/decision` przeprowadza decyzję administratora na dzierżawie
 * z odwołania (`EXTEND` zatwierdza wniosek, `DOWNSCOPE`/`REVOKE` zamykają go odrzuceniem,
 * a Last Admin Protection odpowiada `403` i zostawia wniosek `PENDING`), a
 * `POST /api/v1/appeals/{id}/reject` odrzuca wniosek bez dotykania dzierżawy.
 *
 * Osobny plik od `DecisionModal.test.tsx`: tamten pilnuje ścieżki dzierżawy
 * (`POST /api/v1/leases/{id}/decision`) i ma zostać nietknięty.
 */

const pendingAppeal: AppealOverview = appealsFixture[0]; // dzierżawa 5, marta, status PENDING
const otherLease: LeaseOverview = leasesFixture[0]; // dzierżawa 1 z fixture'ów, ACTIVE
const REJECTION_JUSTIFICATION = 'Brak konkretnego planu użycia dostępu w tym tygodniu.';
const REJECTION_REQUIRED = 'Uzasadnienie odrzucenia jest wymagane';
const DECISION_JUSTIFICATION = 'Dostęp służy dziś tylko odczytowi — zapotrzebowania nie ma.';
const DECISION_REQUIRED = 'Uzasadnienie jest wymagane';
const ALREADY_RESOLVED = 'To odwołanie zostało już rozstrzygnięte.';
const LAST_ADMIN_MESSAGE = 'Nie można odebrać uprawnień ostatniemu administratorowi.';
const APPROVAL_SUCCESS = 'Odwołanie zatwierdzone';
const HISTORY_TEST_ID = 'appeal-history';
const ACTIVITY_TEST_ID = 'appeal-activity';
const LEASE_CONTEXT_TEST_ID = 'appeal-lease-context';

/** `resetAppealsMswState()` nie jest wołany przez `setup.ts` — stan tej domeny czyścimy tutaj. */
beforeEach(() => {
  resetAppealsMswState();
  toast.dismiss();
});

/**
 * Tryb odwołania nie potrzebuje już propa `lease` (wszystko niesie `AppealOverview`),
 * więc renderujemy go bez dzierżawy — to jest właśnie regresja, której pilnujemy.
 */
async function renderAppealModal(
  onOpenChange: (open: boolean) => void = () => {},
  appeal: AppealOverview = pendingAppeal,
): Promise<void> {
  renderWithProviders(
    <DecisionModal appeal={appeal} lease={null} open onOpenChange={onOpenChange} />,
  );

  // Wybór daty wymaga czasu symulowanego z API — czekamy, aż modal będzie gotowy.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
  });
}

describe('DecisionModal w trybie odwołania', () => {
  it('pokazuje kontekst odwołania z pól overview, bez udziału listy dzierżaw', async () => {
    await renderAppealModal();

    expect(screen.getByText('Rozpatrzenie odwołania')).toBeInTheDocument();
    expect(screen.getByText('Marta (marta)')).toBeInTheDocument();
    expect(screen.getByTestId('appeal-justification')).toHaveTextContent(
      pendingAppeal.justification,
    );

    const context = screen.getByTestId(LEASE_CONTEXT_TEST_ID);
    expect(context).toHaveTextContent('longtails/qa-automation');
    expect(context).toHaveTextContent('Odczyt (read)');
    expect(context).toHaveTextContent('Pozostało 2 dni');
    expect(context).toHaveTextContent(/Poprzednie odwołania\s*0/);
  });

  it('pokazuje historię odwołań tej dzierżawy i statystyki aktywności', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await renderAppealModal();

    // Historia jest filtrowana po `lease_id` (zarówno zapytaniem, jak i fixture'ami),
    // więc odwołania innych dzierżaw nie wchodzą.
    const history = await screen.findByTestId(HISTORY_TEST_ID);
    expect(within(history).getByText(pendingAppeal.justification)).toBeInTheDocument();
    expect(within(history).getByText('Oczekujące')).toBeInTheDocument();
    expect(within(history).queryByText(appealsFixture[1].justification)).not.toBeInTheDocument();
    expect(within(history).queryByText(appealsFixture[2].justification)).not.toBeInTheDocument();

    // Liczniki pochodzą z `GET /api/v1/leases/{lease_id}/activity-stats` dla **tej** dzierżawy;
    // liczby bierzemy z tego samego źródła zamiast wpisywać je na sztywno (shared/activity.json).
    const stats = await fetchActivityStats(pendingAppeal.lease_id);
    const activity = screen.getByTestId(ACTIVITY_TEST_ID);
    expect(within(activity).getByTestId('stat-push')).toHaveTextContent(String(stats.push_count));
    expect(within(activity).getByTestId('stat-review')).toHaveTextContent(
      String(stats.review_count),
    );
    expect(within(activity).getByTestId('stat-comment')).toHaveTextContent(
      String(stats.comment_count),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/leases/${String(pendingAppeal.lease_id)}/activity-stats`,
      expect.anything(),
    );
  });

  it('odrzuca odwołanie przez /reject, potwierdza toastem i zamyka modal', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    await renderAppealModal(onOpenChange);

    await user.type(screen.getByLabelText('Uzasadnienie odrzucenia'), REJECTION_JUSTIFICATION);
    await user.click(screen.getByRole('button', { name: 'Odrzuć odwołanie' }));

    await waitFor(() => {
      expect(getLastAppealRejection()).toEqual({
        appeal_id: pendingAppeal.id,
        justification: REJECTION_JUSTIFICATION,
      });
    });
    // Odrzucenie nie może iść żadną inną ścieżką (decyzja o odwołaniu ani o dzierżawie).
    expect(getLastAppealDecision()).toBeNull();
    expect(getLastDecisionRequest()).toBeNull();
    expect(getLastAppealRequest()).toBeNull();

    expect(await screen.findByText('Odwołanie odrzucone')).toBeInTheDocument();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('wymaga uzasadnienia odrzucenia i nie wysyła żądania bez niego', async () => {
    const user = userEvent.setup();
    await renderAppealModal();

    await user.click(screen.getByRole('button', { name: 'Odrzuć odwołanie' }));

    expect(await screen.findByText(REJECTION_REQUIRED)).toBeInTheDocument();
    expect(screen.getByLabelText('Uzasadnienie odrzucenia')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(getLastAppealRejection()).toBeNull();
  });

  it('traktuje uzasadnienie odrzucenia z samych białych znaków jako puste', async () => {
    const user = userEvent.setup();
    await renderAppealModal();

    await user.type(screen.getByLabelText('Uzasadnienie odrzucenia'), '   ');
    await user.click(screen.getByRole('button', { name: 'Odrzuć odwołanie' }));

    expect(await screen.findByText(REJECTION_REQUIRED)).toBeInTheDocument();
    expect(getLastAppealRejection()).toBeNull();
  });

  it('zatwierdza odwołanie wybranym przedłużeniem przez /decision i zamyka modal', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    await renderAppealModal(onOpenChange);

    await user.click(screen.getByRole('button', { name: '2x' }));
    await user.click(screen.getByRole('button', { name: 'Zatwierdź odwołanie' }));

    await waitFor(() => {
      expect(getLastAppealDecision()).toEqual({
        appeal_id: pendingAppeal.id,
        request: { action: 'EXTEND', extension: { multiplier: 2 } },
      });
    });
    // Zatwierdzenie idzie wyłącznie decyzją o dzierżawie: bez odrzucenia i bez nowego wniosku.
    expect(getLastAppealRejection()).toBeNull();
    expect(getLastAppealRequest()).toBeNull();
    expect(getLastDecisionRequest()).toBeNull();

    expect(await screen.findByText(APPROVAL_SUCCESS)).toBeInTheDocument();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('nie zatwierdza odwołania bez wybranego przedłużenia', async () => {
    const user = userEvent.setup();
    await renderAppealModal();

    const approve = screen.getByRole('button', { name: 'Zatwierdź odwołanie' });
    expect(approve).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '+30' }));

    expect(approve).toBeEnabled();
    expect(getLastAppealDecision()).toBeNull();
  });

  it('wymaga uzasadnienia przy odebraniu dostępu (silnik: REVOKE) i wysyła je przez /decision', async () => {
    const user = userEvent.setup();
    await renderAppealModal();

    await user.click(screen.getByRole('button', { name: 'Wyłącz' }));
    await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));

    // Silnik odrzuca `REVOKE` bez uzasadnienia (422), więc modal nie wysyła żądania.
    expect(await screen.findByText(DECISION_REQUIRED)).toBeInTheDocument();
    expect(getLastAppealDecision()).toBeNull();

    await user.type(screen.getByLabelText('Uzasadnienie'), DECISION_JUSTIFICATION);
    await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));

    await waitFor(() => {
      expect(getLastAppealDecision()).toEqual({
        appeal_id: pendingAppeal.id,
        request: { action: 'REVOKE', justification: DECISION_JUSTIFICATION },
      });
    });
  });

  it('deeskaluje dzierżawę write (DOWNSCOPE) uzasadnieniem z tego samego formularza', async () => {
    const user = userEvent.setup();
    await renderAppealModal(() => {}, {
      ...pendingAppeal,
      lease_role: 'write',
      requested_role: 'write',
    });

    await user.type(screen.getByLabelText('Uzasadnienie'), DECISION_JUSTIFICATION);
    await user.click(screen.getByRole('button', { name: 'Zdeeskaluj' }));

    await waitFor(() => {
      expect(getLastAppealDecision()).toEqual({
        appeal_id: pendingAppeal.id,
        request: { action: 'DOWNSCOPE', justification: DECISION_JUSTIFICATION },
      });
    });
  });

  it('pokazuje 403 ostatniego administratora i zostawia wniosek oczekujący', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    const adminLease: LeaseOverview | undefined = leasesFixture.find(
      (lease: LeaseOverview): boolean => lease.current_role === 'admin',
    );
    expect(adminLease).toBeDefined();
    bindAppealToLease(pendingAppeal.id, adminLease?.id ?? 0);

    await renderAppealModal(onOpenChange);
    await user.click(screen.getByRole('button', { name: 'Wyłącz' }));
    await user.type(screen.getByLabelText('Uzasadnienie'), DECISION_JUSTIFICATION);
    await user.click(screen.getByRole('button', { name: 'Potwierdzam wyłączenie' }));

    expect(await screen.findByText(LAST_ADMIN_MESSAGE)).toBeInTheDocument();
    expect(getLastAppealDecision()).toBeNull();
    // Backend commituje wtedy sam wpis audytowy, a wniosek zostaje `PENDING` — modal nie zamyka się.
    expect(
      (await fetchAppeals()).find(
        (appeal: AppealOverview): boolean => appeal.id === pendingAppeal.id,
      )?.status,
    ).toBe('PENDING');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('nazywa po polsku wniosek rozstrzygnięty już poza modalem (409 silnika)', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    await rejectAppeal(pendingAppeal.id, 'Rozstrzygnięte poza modalem.');

    await renderAppealModal(onOpenChange);
    await user.click(screen.getByRole('button', { name: '+7' }));
    await user.click(screen.getByRole('button', { name: 'Zatwierdź odwołanie' }));

    expect(await screen.findByText(ALREADY_RESOLVED)).toBeInTheDocument();
    expect(getLastAppealDecision()).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('DecisionModal bez odwołania', () => {
  it('nie pokazuje sekcji odwołania ani statystyk aktywności', async () => {
    renderWithProviders(<DecisionModal lease={otherLease} open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
    });

    expect(screen.queryByText('Rozpatrzenie odwołania')).not.toBeInTheDocument();
    expect(screen.queryByText('Uzasadnienie odwołania')).not.toBeInTheDocument();
    expect(screen.queryByTestId(HISTORY_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ACTIVITY_TEST_ID)).not.toBeInTheDocument();
  });
});
