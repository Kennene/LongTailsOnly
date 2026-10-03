import { screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { auditFixture } from '@/api/fixtures/audit';
import { AuditPage } from '@/pages/AuditPage';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AuditEntry } from '@/types/api';

const COLUMN_HEADERS: string[] = ['Aktor', 'Czas', 'Akcja', 'Cel', 'Uzasadnienie'];
const EMPTY_STATE = 'Brak zdarzeń w dzienniku';
const API_ERROR = 'Dziennik audytu jest niedostępny';

/**
 * Uzasadnienie dłuższe niż dwie linie. Fixture z `shared/fixtures/audit.json` jest krótki
 * (najdłuższe ma 84 znaki), więc długą prozę podajemy przez `server.use` — dowód na przycinanie
 * i rezerwację szerokości nie może zależeć od doboru danych demo.
 */
const LONG_JUSTIFICATION =
  'Dostęp zapisujący do legacy-reports był potrzebny wyłącznie do jednorazowej migracji danych na nowy magazyn raportów; po zakończeniu prac uprawnienie zostaje odebrane, a zespół pracuje dalej na odczycie.';

/** Rozwija wszystkich aktorów — wpisy są domyślnie zwinięte pod wierszem aktora. */
async function expandAll(user: UserEvent): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Rozwiń wszystkie' }));
}

/** Wiersz aktora — ten, w którym siedzi jego przycisk rozwijania. */
function actorRow(owner: string): HTMLElement {
  const toggle: HTMLElement = screen.getByRole('button', { name: new RegExp(`wpisy: ${owner}$`) });
  const row: HTMLElement | undefined = within(screen.getByRole('table'))
    .getAllByRole('row')
    .find((candidate: HTMLElement): boolean =>
      within(candidate).queryAllByRole('button').includes(toggle),
    );
  if (row === undefined) {
    throw new Error(`Brak wiersza aktora ${owner}`);
  }

  return row;
}

/** Wiersz z długim uzasadnieniem — pełny kształt `AuditEntry`, taki sam jak z API. */
function longJustificationEntry(): AuditEntry {
  return {
    id: 99,
    timestamp: '2026-10-03T00:05:00Z',
    actor_type: 'ADMIN',
    actor_id: 1,
    actor_login: 'tomasz-admin',
    action: 'LEASE_REVOKED',
    target: 'kamil@legacy-reports',
    details: { reason: 'migration-finished' },
    justification: LONG_JUSTIFICATION,
  };
}

it('renders audit entries with time, actor, action, target and a details preview', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AuditPage />);

  await expandAll(user);
  expect(await screen.findByText('LEASE_EXPIRED')).toBeInTheDocument();

  for (const header of COLUMN_HEADERS) {
    expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
  }

  const table = within(screen.getByRole('table'));

  // Czas formatuje `formatDateTimePl` (Europe/Warsaw): 2026-09-29T11:30:00Z → 13:30.
  const approvedRow: HTMLElement = table.getByRole('row', { name: /APPEAL_APPROVED/ });
  expect(within(approvedRow).getByText('29 września 2026, 13:30')).toBeInTheDocument();
  expect(within(approvedRow).getByText('kamil@payment-service')).toBeInTheDocument();
  // Podgląd `details` to jedno zdanie z separatorem `·`, a nie surowy JSON.
  expect(
    within(approvedRow).getByText('lease_id: 3 · preset_days: 30 · requested_role: write'),
  ).toBeInTheDocument();

  // Dwa wpisy SYSTEM dzielą znacznik czasu — oba renderują tę samą, pełną formę daty, a trzecią
  // pokazuje wiersz aktora SYSTEM (czas jego ostatniego wpisu).
  expect(table.getAllByText('3 października 2026, 02:05')).toHaveLength(3);
  // Oba wpisy SYSTEM siedzą pod jednym wierszem aktora.
  expect(table.getAllByText('SYSTEM').length).toBe(1);
  // Kreska niesie brak: aktor SYSTEM nie ma człowieka, a wpisy SYSTEM nie mają uzasadnienia.
  expect(table.getAllByText('—').length).toBeGreaterThan(0);
});

it('keeps the time and actor cells on a single line', async () => {
  renderWithProviders(<AuditPage />);

  expect(await screen.findByRole('button', { name: 'Pokaż wpisy: SYSTEM' })).toBeInTheDocument();

  const rows: HTMLElement[] = within(screen.getByRole('table')).getAllByRole('row');
  const cells: HTMLElement[] = within(rows[1]).getAllByRole('cell');
  const [actorCell, timeCell] = cells;

  expect(timeCell).toHaveClass('whitespace-nowrap');
  expect(actorCell).toHaveClass('whitespace-nowrap');
  // Typ i identyfikator aktora dzielą jedną linię — jedno zdanie, nie dwa bloki.
  expect(actorCell).toHaveTextContent('SYSTEM —');
});

it('shows the actor login the backend resolved instead of the numeric id', async () => {
  renderWithProviders(<AuditPage />);

  expect(await screen.findByRole('button', { name: 'Pokaż wpisy: SYSTEM' })).toBeInTheDocument();

  const adminCell: HTMLElement = within(actorRow('tomasz-admin')).getAllByRole('cell')[0];
  expect(adminCell).toHaveTextContent('ADMIN tomasz-admin');
  expect(adminCell).not.toHaveTextContent('#1');

  const userCell: HTMLElement = within(actorRow('kamil')).getAllByRole('cell')[0];
  expect(userCell).toHaveTextContent('USER kamil');
  expect(userCell).not.toHaveTextContent('#2');

  // SYSTEM nie ma człowieka, więc nie ma loginu — komórka pokazuje typ i kreskę, nigdy pustkę.
  const systemCell: HTMLElement = within(actorRow('SYSTEM')).getAllByRole('cell')[0];
  expect(systemCell).toHaveTextContent('SYSTEM —');
  expect(systemCell.textContent?.trim()).not.toBe('');
});

it('clamps a long justification to two lines and keeps the full text in the title', async () => {
  expect(LONG_JUSTIFICATION.length).toBeGreaterThan(120);
  server.use(http.get('/api/v1/audit', () => HttpResponse.json([longJustificationEntry()])));
  renderWithProviders(<AuditPage />);

  await expandAll(userEvent.setup());
  const table = within(await screen.findByRole('table'));

  // Uzasadnienie: rezerwujemy szerokość kolumny i przycinamy prozę do dwóch linii, a pełny
  // tekst zostaje dostępny w podpowiedzi (natywny `title`, bez dokładania JS-a).
  const justificationCell: HTMLElement = table.getByRole('cell', { name: LONG_JUSTIFICATION });
  expect(justificationCell).toHaveClass('w-96');

  const justification: HTMLElement = within(justificationCell).getByText(LONG_JUSTIFICATION);
  expect(justification).toHaveClass('line-clamp-2');
  expect(justification).toHaveAttribute('title', LONG_JUSTIFICATION);
});

it('narrows the table to the selected actor type', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AuditPage />);

  await expandAll(user);
  expect(await screen.findByText('LEASE_EXPIRED')).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Aktor'), 'ADMIN');

  const adminTable = within(screen.getByRole('table'));
  expect(adminTable.queryByText('SYSTEM')).not.toBeInTheDocument();
  expect(adminTable.queryByText('APPEAL_SUBMITTED')).not.toBeInTheDocument();
  expect(adminTable.getByText('APPEAL_APPROVED')).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Aktor'), 'SYSTEM');

  const systemTable = within(screen.getByRole('table'));
  expect(systemTable.getAllByText('SYSTEM').length).toBe(1);
  expect(systemTable.getAllByText('LEASE_EXPIRED').length).toBeGreaterThan(0);
  expect(systemTable.queryByText('APPEAL_APPROVED')).not.toBeInTheDocument();
});

it('renders the empty state when the log has no entries', async () => {
  // `GET /api/v1/audit` oddaje gołą tablicę — żadnej koperty `{ entries }`.
  server.use(http.get('/api/v1/audit', () => HttpResponse.json([])));

  renderWithProviders(<AuditPage />);

  expect(await screen.findByText(EMPTY_STATE)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('shows the API error with a retry action that reloads the log', async () => {
  let isFailing = true;
  server.use(
    http.get('/api/v1/audit', () =>
      isFailing
        ? HttpResponse.json({ detail: API_ERROR }, { status: 500 })
        : HttpResponse.json(auditFixture),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<AuditPage />);

  expect(await screen.findByText(API_ERROR)).toBeInTheDocument();

  isFailing = false;
  await user.click(screen.getByRole('button', { name: 'Odśwież' }));

  expect(await screen.findByRole('button', { name: 'Pokaż wpisy: SYSTEM' })).toBeInTheDocument();
});

it('collapses the log to one row per actor with an entry count and the latest time', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AuditPage />);

  const toggle: HTMLElement = await screen.findByRole('button', { name: 'Pokaż wpisy: SYSTEM' });
  const actors: number = new Set(
    auditFixture.map((entry: AuditEntry): string => `${entry.actor_type}:${entry.actor_login}`),
  ).size;

  // Nagłówek + jeden wiersz na aktora, dopóki nic nie jest rozwinięte.
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(actors + 1);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(within(actorRow('SYSTEM')).getByText('2 wpisy')).toBeInTheDocument();
  expect(screen.queryByText('LEASE_EXPIRED')).not.toBeInTheDocument();

  await user.click(toggle);

  expect(screen.getAllByText('LEASE_EXPIRED').length).toBeGreaterThan(0);
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(actors + 3);
});
