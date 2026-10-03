import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appealsFixture } from '@/api/fixtures';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { getLastAppealDecision, resetAppealsMswState } from '@/test/msw/domains/appeals';
import { getLastDecisionRequest } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AppealRead, LeaseOverview } from '@/types/api';

/**
 * Tryb odwołania modala decyzji (UC-3, zadanie 11).
 *
 * Osobny plik od `DecisionModal.test.tsx`: tamten pilnuje ścieżki dzierżawy
 * (`POST /api/v1/leases/{id}/decision`) i ma zostać nietknięty, bo jest regresją
 * kompatybilności propa `appeal` (jego brak = dzisiejsze zachowanie).
 */

const pendingAppeal: AppealRead = appealsFixture[0]; // dzierżawa 3, status PENDING
const expiredLease: LeaseOverview = {
  id: 3,
  user: {
    id: 4,
    login: 'piotr',
    name: 'Piotr Lewandowski',
    is_admin: false,
    team: { id: 1, name: 'DEV', slug: 'dev' },
  },
  repository: {
    id: 3,
    name: 'legacy-reports',
    owner: 'longtails',
    default_branch: 'main',
    default_lease_duration_days: 30,
  },
  current_role: 'write',
  granted_at: '2026-08-01T00:00:00Z',
  expires_at: '2026-09-30T00:00:00Z',
  is_active: false,
  status: 'EXPIRED',
  days_remaining: -3,
  last_activity_at: null,
  recommendation: 'REVOKE',
};
const otherLease: LeaseOverview = { ...expiredLease, id: 1 };

const HISTORY_TEST_ID = 'appeal-history';
const ACTIVITY_TEST_ID = 'appeal-activity';

/** `resetAppealsMswState()` nie jest wołany przez `setup.ts` — stan tej domeny czyścimy tutaj. */
beforeEach(() => {
  resetAppealsMswState();
  toast.dismiss();
});

async function renderAppealModal(onOpenChange: (open: boolean) => void = () => {}): Promise<void> {
  renderWithProviders(
    <DecisionModal appeal={pendingAppeal} lease={expiredLease} open onOpenChange={onOpenChange} />,
  );

  // Wybór daty wymaga czasu symulowanego z API — czekamy, aż modal będzie gotowy.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
  });
}

describe('DecisionModal w trybie odwołania', () => {
  it('pokazuje uzasadnienie odwołania oraz pustą historię, gdy dzierżawa ma jedno odwołanie', async () => {
    // Dzierżawa bez innych odwołań w fixture'ach — `AppealHistory` ma wtedy pokazać pustkę.
    const lonelyAppeal: AppealRead = { ...pendingAppeal, id: 99, lease_id: 99 };
    renderWithProviders(
      <DecisionModal
        appeal={lonelyAppeal}
        lease={{ ...expiredLease, id: 99 }}
        open
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
    });

    expect(screen.getByText('Uzasadnienie odwołania')).toBeInTheDocument();
    // Ta sama treść jest też w historii (modal pokazuje wniosek i wpis w historii),
    // więc asercję przypinamy do akapitu uzasadnienia.
    expect(screen.getByTestId('appeal-justification')).toHaveTextContent(
      lonelyAppeal.justification,
    );
    expect(await screen.findByText('Brak odwołań')).toBeInTheDocument();
  });

  it('pokazuje historię odwołań tej dzierżawy i statystyki aktywności', async () => {
    await renderAppealModal();

    // Historia filtruje pełną listę po `lease_id`, więc odwołania innych dzierżaw nie wchodzą.
    expect(screen.queryByText(appealsFixture[1].justification)).not.toBeInTheDocument();
    expect(screen.queryByText(appealsFixture[2].justification)).not.toBeInTheDocument();

    const history = screen.getByTestId(HISTORY_TEST_ID);
    expect(within(history).getByText('Oczekujące')).toBeInTheDocument();

    const activity = screen.getByTestId(ACTIVITY_TEST_ID);
    expect(within(activity).getByTestId('stat-push')).toHaveTextContent('5');
    expect(within(activity).getByTestId('stat-review')).toHaveTextContent('4');
    expect(within(activity).getByTestId('stat-comment')).toHaveTextContent('7');
  });

  it('wysyła decyzję na endpoint odwołania, potwierdza toastem i zamyka modal', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    await renderAppealModal(onOpenChange);

    await user.click(screen.getByRole('button', { name: '2x' }));
    await user.click(screen.getByRole('button', { name: 'Zatwierdź decyzję' }));

    await waitFor(() => {
      expect(getLastAppealDecision()).toEqual({
        appeal_id: pendingAppeal.id,
        request: { action: 'EXTEND', extension: { multiplier: 2 } },
      });
    });
    // Decyzja o odwołaniu nie może iść drugą ścieżką (endpoint dzierżawy).
    expect(getLastDecisionRequest()).toBeNull();

    expect(await screen.findByText('Decyzja zapisana')).toBeInTheDocument();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

describe('DecisionModal bez odwołania', () => {
  it('nie pokazuje sekcji odwołania ani statystyk aktywności', async () => {
    renderWithProviders(<DecisionModal lease={otherLease} open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Data' })).toBeEnabled();
    });

    expect(screen.queryByText('Uzasadnienie odwołania')).not.toBeInTheDocument();
    expect(screen.queryByTestId(HISTORY_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ACTIVITY_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByText('Brak odwołań')).not.toBeInTheDocument();
  });
});
