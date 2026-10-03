import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchActivityStats } from '@/api/activity';
import { appealsFixture, leasesFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import {
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
 * Backend ma dziś wyłącznie `POST /api/v1/appeals/{id}/reject` — nie ma ani endpointu
 * `/decision` w domenie odwołań, ani decyzji o dzierżawie (3.6/5.5). Modal musi więc
 * odrzucać wniosek realnym żądaniem, a ścieżkę zatwierdzenia zostawiać wyłączoną z wyjaśnieniem.
 *
 * Osobny plik od `DecisionModal.test.tsx`: tamten pilnuje ścieżki dzierżawy
 * (`POST /api/v1/leases/{id}/decision`) i ma zostać nietknięty.
 */

const pendingAppeal: AppealOverview = appealsFixture[0]; // dzierżawa 5, marta, status PENDING
const otherLease: LeaseOverview = leasesFixture[0]; // dzierżawa 1 z fixture'ów, ACTIVE
const REJECTION_JUSTIFICATION = 'Brak konkretnego planu użycia dostępu w tym tygodniu.';
const REJECTION_REQUIRED = 'Uzasadnienie odrzucenia jest wymagane';
const APPROVE_UNAVAILABLE =
  'Zatwierdzenie wymaga endpointu decyzji o dzierżawie (3.6/5.5) — jeszcze go nie ma.';
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
async function renderAppealModal(onOpenChange: (open: boolean) => void = () => {}): Promise<void> {
  renderWithProviders(
    <DecisionModal appeal={pendingAppeal} lease={null} open onOpenChange={onOpenChange} />,
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
    expect(within(activity).getByTestId('stat-push')).toHaveTextContent(String(stats.push));
    expect(within(activity).getByTestId('stat-review')).toHaveTextContent(String(stats.review));
    expect(within(activity).getByTestId('stat-comment')).toHaveTextContent(String(stats.comment));
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

  it('wyłącza zatwierdzenie odwołania i wyjaśnia brak endpointu decyzji o dzierżawie', async () => {
    const user = userEvent.setup();
    await renderAppealModal();

    expect(screen.getByText(APPROVE_UNAVAILABLE)).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Zatwierdź odwołanie' });
    expect(approve).toBeDisabled();

    // Szkic przedłużenia zostaje wybieralny (modal pokazuje, co odwołanie by dało),
    // ale bez endpointu decyzji o dzierżawie nie może wysłać żadnego żądania.
    await user.click(screen.getByRole('button', { name: '2x' }));
    expect(approve).toBeDisabled();
    expect(getLastDecisionRequest()).toBeNull();
    expect(getLastAppealRejection()).toBeNull();
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
