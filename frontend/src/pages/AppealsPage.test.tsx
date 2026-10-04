import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it } from 'vitest';

import { appealsFixture, leasesFixture } from '@/api/fixtures';
import { fetchLeases } from '@/api/leases';
import { groupLeasesByUser } from '@/components/leases/leaseGroups';
import { AppealsPage } from '@/pages/AppealsPage';
import {
  getLastAppealDecision,
  getLastAppealRejection,
  getLastAppealRequest,
  resetAppealsMswState,
} from '@/test/msw/domains/appeals';
import { server } from '@/test/msw/server';
import { getLeases } from '@/test/msw/state';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { LeaseOverview } from '@/types/api';

const UNIQUE_JUSTIFICATION = 'Prowadzę release v2.1 w przyszłym tygodniu';
const REJECTION_JUSTIFICATION = 'Brak konkretnego planu użycia dostępu w tym tygodniu.';
const FORM_ERROR = 'Uzasadnienie jest wymagane';
const DUPLICATE_MESSAGE = 'To uzasadnienie zostało już użyte przy innym odwołaniu. Podaj inne.';
const NOT_APPEALABLE_MESSAGE =
  'Odwołanie można złożyć tylko dla odebranego dostępu albo takiego, który wygasa w ciągu 7 dni.';
const PENDING_APPEAL_MESSAGE = 'Ten dostęp ma już nierozpatrzone odwołanie.';
const EMPTY_STATE =
  'Brak dostępów do odwołania — odwołanie przysługuje odebranym dostępom oraz tym, które wygasły albo wygasają w ciągu 7 dni.';
const SUBMITTED_LIST = 'Złożone odwołania';
const LEASES_URL = '/api/v1/leases';
const APPEALS_URL = '/api/v1/appeals';
/** Pierwsze odwołanie z fixture'ów: dostęp 5, którego **nie ma** wśród kandydatów do odwołania. */
const PENDING_APPEAL = appealsFixture[0];

/**
 * Reguła silnika (`appeal_rules.is_appealable`) zapisana w teście **wprost**: odebrany dostęp
 * oraz `WARNING`/`EXPIRED`. Świadomie nie wołamy tu produkcyjnego `isAppealable` — inaczej asercja
 * „lista oferowanych = lista kandydatów” porównywałaby helper sam ze sobą i przeszłaby także po
 * regresji w nim. Dostępy bierzemy z „backendu” (MSW), żeby wymiana fixture'ów dostępów
 * (wspólne `shared/fixtures/`) nie robiła z tego testu fałszywej regresji.
 */
function isAppealableByEngineRule(lease: LeaseOverview): boolean {
  return lease.status === 'REVOKED' || lease.status === 'WARNING' || lease.status === 'EXPIRED';
}

function appealCandidates(): LeaseOverview[] {
  return getLeases().filter(isAppealableByEngineRule);
}

/** Odebrany dostęp, którego nie ma w fixture'ach (tam każdy wiersz jest aktywny). */
function revokedLease(): LeaseOverview {
  return {
    ...leasesFixture[0],
    id: 99,
    is_active: false,
    status: 'REVOKED',
    days_remaining: null,
  };
}

beforeEach(() => {
  resetAppealsMswState();
  // Sonner trzyma kolejkę toastów w stanie modułu (a `Toaster` montuje `renderWithProviders`),
  // więc czyścimy ją między testami — inaczej asercja braku toastu widzi komunikaty z poprzednich.
  toast.dismiss();
});

/**
 * `Toaster` montuje `renderWithProviders` (razem ze stubem `window.matchMedia` w `test/setup.ts`),
 * więc testy nie dokładają własnego — dwa toastery dają zduplikowane komunikaty.
 */
function renderAppealsPage(): void {
  renderWithProviders(<AppealsPage />);
}

/** Rozwija wszystkie grupy w karcie (osoby są domyślnie zwinięte, jak w tabeli dostępów). */
async function expandAll(user: UserEvent, cardName: string): Promise<void> {
  const card: HTMLElement = await screen.findByRole('region', { name: cardName });
  await user.click(await within(card).findByRole('button', { name: 'Rozwiń wszystkie' }));
}

/** Wybiera pierwszego kandydata z listy i zwraca jego dostęp (do asercji na wierszu). */
async function selectFirstCandidate(user: UserEvent): Promise<LeaseOverview> {
  const [candidate] = appealCandidates();
  expect(candidate).toBeDefined();

  await user.selectOptions(await screen.findByLabelText('Dostęp'), String(candidate.id));
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

    await expandAll(user, SUBMITTED_LIST);
    const submitted = await screen.findByRole('list', { name: SUBMITTED_LIST });
    expect(await within(submitted).findByText(UNIQUE_JUSTIFICATION)).toBeInTheDocument();
    // Osoba i repozytorium pochodzą z `AppealOverview` zwróconego przez `POST /api/v1/appeals`,
    // a nie z łączenia z listą dostępów — dlatego wystarczy, że są w tym samym wierszu co wniosek.
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

  it('renderuje osobę, repozytorium i pozostałe dni z overview, bez łączenia z dostępami', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await expandAll(user, SUBMITTED_LIST);
    const submitted = await screen.findByRole('list', { name: SUBMITTED_LIST });

    // Dostępu 5 nie ma wśród kandydatów (a `GET /api/v1/leases` nawet nie istnieje),
    // więc te dane mogą pochodzić wyłącznie z `AppealOverview`.
    expect(within(submitted).getByText('Marta')).toBeInTheDocument();
    expect(within(submitted).getByText('qa-automation')).toBeInTheDocument();
    expect(within(submitted).getByText('Pozostało 2 dni')).toBeInTheDocument();
  });

  it('otwiera modal rozpatrzenia także dla odwołania spoza listy dostępów', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await expandAll(user, SUBMITTED_LIST);
    const resolveButton = await screen.findByRole('button', { name: 'Rozpatrz' });
    expect(resolveButton).toBeEnabled();
    await user.click(resolveButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Rozpatrzenie odwołania')).toBeInTheDocument();
    expect(within(dialog).getByText('Marta')).toBeInTheDocument();
    expect(within(dialog).getByText('longtails/qa-automation')).toBeInTheDocument();
    expect(within(dialog).getByText('Uzasadnienie odwołania')).toBeInTheDocument();
    expect(getLastAppealRejection()).toBeNull();
  });

  it('zatwierdza odwołanie przedłużeniem i pokazuje wniosek oraz dzierżawę po decyzji', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await expandAll(user, SUBMITTED_LIST);
    await user.click(await screen.findByRole('button', { name: 'Rozpatrz' }));
    await user.click(await screen.findByRole('button', { name: '+30' }));
    await user.click(screen.getByRole('button', { name: 'Zatwierdź odwołanie' }));

    await waitFor(() => {
      expect(getLastAppealDecision()).toEqual({
        appeal_id: PENDING_APPEAL.id,
        request: { action: 'EXTEND', extension: { custom_days: 30 } },
      });
    });
    expect(await screen.findByText('Odwołanie zatwierdzone')).toBeInTheDocument();

    // Zatwierdzenie zamyka wniosek jako `APPROVED` — lista odświeża się po unieważnieniu `['appeals']`.
    const submitted = await screen.findByRole('list', { name: SUBMITTED_LIST });
    expect(within(submitted).getAllByText('Zatwierdzone')).toHaveLength(2);
    expect(within(submitted).queryByText('Oczekujące')).not.toBeInTheDocument();
    expect(within(submitted).queryByRole('button', { name: 'Rozpatrz' })).not.toBeInTheDocument();

    // Decyzja poszła na dzierżawę z odwołania (unieważnione `['leases']`), a nie tylko na wniosek.
    const extended: LeaseOverview | undefined = (await fetchLeases()).find(
      (lease: LeaseOverview): boolean => lease.id === PENDING_APPEAL.lease_id,
    );
    expect(extended).toMatchObject({ is_active: true, status: 'ACTIVE' });
  });

  it('odrzuca odwołanie z uzasadnieniem i odświeża listę z nowym statusem', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    await expandAll(user, SUBMITTED_LIST);
    await user.click(await screen.findByRole('button', { name: 'Rozpatrz' }));
    await user.click(await screen.findByRole('button', { name: 'Odrzuć' }));
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

  it('nie oferuje dostępu administratora, a odebrany pokazuje jako kandydata', async () => {
    const permanentLeases: LeaseOverview[] = getLeases().filter(
      (lease: LeaseOverview): boolean => lease.status === 'PERMANENT',
    );
    // Fixture'y muszą mieć co najmniej jednego admina, inaczej ten test nie pinuje wykluczenia.
    expect(permanentLeases.length).toBeGreaterThan(0);
    const revoked: LeaseOverview = revokedLease();
    server.use(http.get(LEASES_URL, () => HttpResponse.json([...getLeases(), revoked])));

    renderAppealsPage();

    const select = await screen.findByLabelText('Dostęp');
    const offered: (string | null)[] = within(select)
      .getAllByRole('option')
      .map((option: HTMLElement): string | null => option.getAttribute('value'));

    expect(offered).toContain(String(revoked.id));
    for (const lease of permanentLeases) {
      expect(offered).not.toContain(String(lease.id));
    }
    // Kolejność jak z API: najpierw fixture'y, na końcu dołożony dostęp odebrany.
    expect(offered).toEqual(
      [...appealCandidates(), revoked].map((lease: LeaseOverview): string => String(lease.id)),
    );
  });

  it('zwija złożone odwołania do jednego wiersza na osobę z liczbą oczekujących', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    const submitted = await screen.findByRole('list', { name: SUBMITTED_LIST });
    const toggle: HTMLElement = await within(submitted).findByRole('button', {
      name: `Pokaż odwołania: ${PENDING_APPEAL.user.name}`,
    });
    const people: number = new Set(appealsFixture.map((appeal) => appeal.user.id)).size;

    expect(within(submitted).getAllByRole('button', { name: /^Pokaż odwołania: / })).toHaveLength(
      people,
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(submitted).getByText('1 oczekujące')).toBeInTheDocument();
    expect(within(submitted).queryByText(PENDING_APPEAL.justification)).not.toBeInTheDocument();
    expect(within(submitted).queryByRole('button', { name: 'Rozpatrz' })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(within(submitted).getByText(PENDING_APPEAL.justification)).toBeInTheDocument();
    expect(within(submitted).getByRole('button', { name: 'Rozpatrz' })).toBeEnabled();
  });

  it('grupuje dostępy wymagające uwagi po osobie i rozwija jej repozytoria', async () => {
    const user = userEvent.setup();
    renderAppealsPage();

    const card: HTMLElement = await screen.findByRole('region', {
      name: 'Dostępy wymagające uwagi',
    });
    const groups = groupLeasesByUser(appealCandidates());
    const toggles: HTMLElement[] = await within(card).findAllByRole('button', {
      name: /^Pokaż dostępy: /,
    });

    expect(toggles.map((toggle: HTMLElement) => toggle.getAttribute('aria-label'))).toEqual(
      groups.map((group) => `Pokaż dostępy: ${group.user.name}`),
    );
    // Nagłówek + jeden wiersz na osobę, dopóki nic nie jest rozwinięte.
    const rows: HTMLElement[] = within(card).getAllByRole('row');
    expect(rows).toHaveLength(groups.length + 1);
    // Wiersz osoby nie powtarza statusu — ten należy do repozytoriów pod nim.
    for (const row of rows.slice(1)) {
      expect(within(row).getAllByRole('cell')[4].textContent).toBe('');
    }

    await expandAll(user, 'Dostępy wymagające uwagi');

    expect(within(card).getAllByRole('row')).toHaveLength(
      groups.length + appealCandidates().length + 1,
    );
  });

  it('nazywa po polsku powód odmowy przyjęcia odwołania (409 silnika)', async () => {
    const detail = 'Appeals are accepted only for revoked leases or leases expiring within 7 days';
    server.use(http.post(APPEALS_URL, () => HttpResponse.json({ detail }, { status: 409 })));
    const user = userEvent.setup();
    renderAppealsPage();

    await selectFirstCandidate(user);
    await user.type(screen.getByLabelText('Uzasadnienie'), UNIQUE_JUSTIFICATION);
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    expect(await screen.findByText(NOT_APPEALABLE_MESSAGE)).toBeInTheDocument();
    // Angielski `detail` silnika zostaje jako szczegół pod zdaniem.
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(screen.queryByText('Odwołanie złożone')).not.toBeInTheDocument();
  });

  it('nazywa po polsku nierozpatrzone odwołanie tego dostępu (409 silnika)', async () => {
    server.use(
      http.post(APPEALS_URL, () =>
        HttpResponse.json({ detail: 'This lease already has a pending appeal' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderAppealsPage();

    await selectFirstCandidate(user);
    await user.type(screen.getByLabelText('Uzasadnienie'), UNIQUE_JUSTIFICATION);
    await user.click(screen.getByRole('button', { name: 'Złóż odwołanie' }));

    expect(await screen.findByText(PENDING_APPEAL_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(DUPLICATE_MESSAGE)).not.toBeInTheDocument();
  });

  it('zapowiada pustą listę kandydatów zdaniem obejmującym także dostępy odebrane', async () => {
    server.use(
      http.get(LEASES_URL, () =>
        HttpResponse.json(
          getLeases().filter((lease: LeaseOverview): boolean => !isAppealableByEngineRule(lease)),
        ),
      ),
    );

    renderAppealsPage();

    expect(await screen.findByText(EMPTY_STATE)).toBeInTheDocument();
    expect(screen.queryByLabelText('Dostęp')).not.toBeInTheDocument();
  });
});
