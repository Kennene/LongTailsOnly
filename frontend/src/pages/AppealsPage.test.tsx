import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { appealsFixture } from '@/api/fixtures';
import { AppealsPage } from '@/pages/AppealsPage';
import {
  getLastAppealRejection,
  getLastAppealRequest,
  resetAppealsMswState,
} from '@/test/msw/domains/appeals';
import { getLeases } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

const UNIQUE_JUSTIFICATION = 'Prowadzę release v2.1 w przyszłym tygodniu';
const REJECTION_JUSTIFICATION = 'Brak konkretnego planu użycia dostępu w tym tygodniu.';
const FORM_ERROR = 'Uzasadnienie jest wymagane';
const DUPLICATE_MESSAGE = 'To uzasadnienie zostało już użyte przy innym odwołaniu. Podaj inne.';
const SUBMITTED_LIST = 'Złożone odwołania';
/** Pierwsze odwołanie z fixture'ów: dzierżawa 5, której **nie ma** wśród kandydatów do odwołania. */
const PENDING_APPEAL = appealsFixture[0];

/**
 * Kandydaci do odwołania to dzierżawy poza `ACTIVE` — dokładnie ta sama lista, którą
 * `AppealsPage` podaje do `AppealForm` i którą widzi handler `POST /api/v1/appeals`.
 * Bierzemy ją z „backendu” (MSW), a nie z literałów w teście, żeby wymiana fixture'ów
 * dzierżaw (wspólne `shared/fixtures/`) nie robiła z tego testu fałszywej regresji.
 */
function appealCandidates(): LeaseOverview[] {
  return getLeases().filter((lease: LeaseOverview): boolean => lease.status !== 'ACTIVE');
}

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

/** Wybiera pierwszego kandydata z listy i zwraca jego dzierżawę (do asercji na wierszu). */
async function selectFirstCandidate(user: UserEvent): Promise<LeaseOverview> {
  const [candidate] = appealCandidates();
  expect(candidate).toBeDefined();

  await user.selectOptions(await screen.findByLabelText('Dzierżawa'), String(candidate.id));
  return candidate;
}

describe('AppealsPage', () => {
  it('wymaga uzasadnienia i nie wysyła żądania, gdy pole jest puste', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await selectFirstCandidate(user);
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    expect(await screen.findByText(FORM_ERROR)).toBeInTheDocument();
    expect(getLastAppealRequest()).toBeNull();
  });

  it('traktuje uzasadnienie z samych białych znaków jako puste', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await selectFirstCandidate(user);
    await user.type(screen.getByLabelText('Uzasadnienie'), '    ');
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    expect(await screen.findByText(FORM_ERROR)).toBeInTheDocument();
    expect(getLastAppealRequest()).toBeNull();
  });

  it('wysyła uzasadnienie, potwierdza toastem i odświeża listę odwołań', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    const candidate = await selectFirstCandidate(user);
    await user.type(screen.getByLabelText('Uzasadnienie'), UNIQUE_JUSTIFICATION);
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    await waitFor(() => {
      expect(getLastAppealRequest()).toEqual({
        lease_id: candidate.id,
        justification: UNIQUE_JUSTIFICATION,
      });
    });
    expect(await screen.findByText('Odwołanie złożone')).toBeInTheDocument();

    const submitted = await screen.findByRole('list', { name: SUBMITTED_LIST });
    expect(within(submitted).getByText(UNIQUE_JUSTIFICATION)).toBeInTheDocument();
    // Osoba i repozytorium pochodzą z `AppealOverview` zwróconego przez `POST /api/v1/appeals`,
    // a nie z łączenia z listą dzierżaw — dlatego wystarczy, że są w tym samym wierszu co wniosek.
    expect(within(submitted).getAllByText(candidate.user.name).length).toBeGreaterThan(0);
    expect(within(submitted).getAllByText(candidate.repository.name).length).toBeGreaterThan(0);
  });

  it('pokazuje polski komunikat, gdy uzasadnienie zostało już użyte (409)', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await selectFirstCandidate(user);
    await user.type(screen.getByLabelText('Uzasadnienie'), PENDING_APPEAL.justification);
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    expect(await screen.findByText(DUPLICATE_MESSAGE)).toBeInTheDocument();
    expect(getLastAppealRequest()).toEqual({
      lease_id: appealCandidates()[0].id,
      justification: PENDING_APPEAL.justification,
    });
  });

  it('renderuje osobę, repozytorium i pozostałe dni z overview, bez łączenia z dzierżawami', async () => {
    renderAppealsPage();

    const submitted = await screen.findByRole('list', { name: SUBMITTED_LIST });

    // Dzierżawy 5 nie ma wśród kandydatów (a `GET /api/v1/leases` nawet nie istnieje),
    // więc te dane mogą pochodzić wyłącznie z `AppealOverview`.
    expect(within(submitted).getByText('Marta')).toBeInTheDocument();
    expect(within(submitted).getByText('qa-automation')).toBeInTheDocument();
    expect(within(submitted).getByText('Pozostało 2 dni')).toBeInTheDocument();
  });

  it('otwiera modal rozpatrzenia także dla odwołania spoza listy dzierżaw', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    const resolveButton = await screen.findByRole('button', { name: 'Rozpatrz' });
    expect(resolveButton).toBeEnabled();
    await user.click(resolveButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Rozpatrzenie odwołania')).toBeInTheDocument();
    expect(within(dialog).getByText('Marta (marta)')).toBeInTheDocument();
    expect(within(dialog).getByText('longtails/qa-automation')).toBeInTheDocument();
    expect(within(dialog).getByText('Uzasadnienie odwołania')).toBeInTheDocument();
    expect(getLastAppealRejection()).toBeNull();
  });

  it('odrzuca odwołanie z uzasadnieniem i odświeża listę z nowym statusem', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await user.click(await screen.findByRole('button', { name: 'Rozpatrz' }));
    await user.type(
      await screen.findByLabelText('Uzasadnienie odrzucenia'),
      REJECTION_JUSTIFICATION,
    );
    await user.click(screen.getByRole('button', { name: 'Odrzuć odwołanie' }));

    await waitFor(() => {
      expect(getLastAppealRejection()).toEqual({
        appeal_id: PENDING_APPEAL.id,
        justification: REJECTION_JUSTIFICATION,
      });
    });
    expect(await screen.findByText('Odwołanie odrzucone')).toBeInTheDocument();

    const submitted = await screen.findByRole('list', { name: SUBMITTED_LIST });
    // Jedno odwołanie było już odrzucone w fixture'ach, drugie odrzucił ten test.
    expect(within(submitted).getAllByText('Odrzucone')).toHaveLength(2);
    // Odrzucone odwołanie nie czeka już na decyzję, więc przycisk znika z listy.
    expect(within(submitted).queryByText('Oczekujące')).not.toBeInTheDocument();
    expect(within(submitted).queryByRole('button', { name: 'Rozpatrz' })).not.toBeInTheDocument();
  });
});
