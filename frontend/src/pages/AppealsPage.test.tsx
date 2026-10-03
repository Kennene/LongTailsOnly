import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { appealsFixture } from '@/api/fixtures';
import { AppealsPage } from '@/pages/AppealsPage';
import {
  getLastAppealDecision,
  getLastAppealRequest,
  resetAppealsMswState,
} from '@/test/msw/domains/appeals';
import { renderWithProviders } from '@/test/renderWithProviders';

const UNIQUE_JUSTIFICATION = 'Prowadzę release v2.1 w przyszłym tygodniu';
const FORM_ERROR = 'Uzasadnienie jest wymagane';
const DUPLICATE_MESSAGE = 'To uzasadnienie zostało już użyte przy innym odwołaniu. Podaj inne.';
const PENDING_LEASE_ID = '2';
const EXPIRED_LEASE_ID = '3';

beforeEach(() => {
  resetAppealsMswState();
});

/**
 * `Toaster` montuje `renderWithProviders` (razem ze stubem `window.matchMedia` w `test/setup.ts`),
 * więc testy nie dokładają własnego — dwa toastery dają zduplikowane komunikaty.
 */
function renderAppealsPage(): void {
  renderWithProviders(<AppealsPage />);
}

describe('AppealsPage', () => {
  it('wymaga uzasadnienia i nie wysyła żądania, gdy pole jest puste', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await user.selectOptions(await screen.findByLabelText('Dzierżawa'), PENDING_LEASE_ID);
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    expect(await screen.findByText(FORM_ERROR)).toBeInTheDocument();
    expect(getLastAppealRequest()).toBeNull();
  });

  it('traktuje uzasadnienie z samych białych znaków jako puste', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await user.selectOptions(await screen.findByLabelText('Dzierżawa'), EXPIRED_LEASE_ID);
    await user.type(screen.getByLabelText('Uzasadnienie'), '    ');
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    expect(await screen.findByText(FORM_ERROR)).toBeInTheDocument();
    expect(getLastAppealRequest()).toBeNull();
  });

  it('wysyła uzasadnienie, potwierdza toastem i odświeża listę odwołań', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await user.selectOptions(await screen.findByLabelText('Dzierżawa'), PENDING_LEASE_ID);
    await user.type(screen.getByLabelText('Uzasadnienie'), UNIQUE_JUSTIFICATION);
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    await waitFor(() => {
      expect(getLastAppealRequest()).toEqual({
        lease_id: Number(PENDING_LEASE_ID),
        justification: UNIQUE_JUSTIFICATION,
      });
    });
    expect(await screen.findByText('Odwołanie złożone')).toBeInTheDocument();

    const submitted = await screen.findByRole('list', { name: 'Złożone odwołania' });
    expect(within(submitted).getByText(UNIQUE_JUSTIFICATION)).toBeInTheDocument();
    // Osoba pochodzi z `useLeases` — `AppealRead` niesie wyłącznie `user_id` i `lease_id`.
    expect(within(submitted).getAllByText('Marta Zielińska').length).toBeGreaterThan(0);
  });

  it('pokazuje polski komunikat, gdy uzasadnienie zostało już użyte (409)', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await user.selectOptions(await screen.findByLabelText('Dzierżawa'), EXPIRED_LEASE_ID);
    await user.type(screen.getByLabelText('Uzasadnienie'), appealsFixture[0].justification);
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    expect(await screen.findByText(DUPLICATE_MESSAGE)).toBeInTheDocument();
  });

  it('otwiera modal decyzji z odwołaniem po kliknięciu „Rozpatrz”', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await user.click(await screen.findByRole('button', { name: 'Rozpatrz' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Decyzja o dzierżawie')).toBeInTheDocument();
    // Kontekst dzierżawy pochodzi z `useLeases` po `lease_id` odwołania (AppealRead go nie niesie).
    expect(within(dialog).getByText('Piotr Lewandowski (piotr)')).toBeInTheDocument();
    expect(within(dialog).getByText('Uzasadnienie odwołania')).toBeInTheDocument();
    expect(getLastAppealDecision()).toBeNull();
  });
});
