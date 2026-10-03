import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { auditFixture } from '@/api/fixtures/audit';
import { AuditPage } from '@/pages/AuditPage';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';

const COLUMN_HEADERS: string[] = ['Czas', 'Aktor', 'Akcja', 'Cel', 'Uzasadnienie'];
const EMPTY_STATE = 'Brak zdarzeń w dzienniku';
const API_ERROR = 'Dziennik audytu jest niedostępny';

/**
 * Najdłuższe uzasadnienie z fixture'a — dowód, że długi tekst (i polskie znaki) zawija się
 * w komórce, a nie rozsadza tabeli (plan, „Zakres przeglądu”, punkt 5).
 */
function findLongJustification(): string {
  const entry = auditFixture.find((candidate) => (candidate.justification?.length ?? 0) > 120);

  return entry?.justification ?? '';
}

it('renders audit entries with time, actor, action, target and a details preview', async () => {
  renderWithProviders(<AuditPage />);

  expect(await screen.findByText('lease.extend')).toBeInTheDocument();

  for (const header of COLUMN_HEADERS) {
    expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
  }

  const table = within(screen.getByRole('table'));

  // Czas formatuje `formatDateTimePl` (Europe/Warsaw), a aktora bierzemy wprost z kontraktu.
  expect(table.getByText('1 października 2026, 18:20')).toBeInTheDocument();
  expect(table.getByText('appeal.submit')).toBeInTheDocument();
  expect(table.getByText('days: 30')).toBeInTheDocument();
  expect(table.getAllByText('SYSTEM').length).toBe(2);
  // Kreska niesie brak: `actor_id` aktora SYSTEM i brak uzasadnienia.
  expect(table.getAllByText('—').length).toBeGreaterThan(0);

  const longJustification: string = findLongJustification();
  expect(longJustification.length).toBeGreaterThan(120);
  expect(table.getByText(longJustification)).toHaveClass('break-words');
});

it('narrows the table to the selected actor type', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AuditPage />);

  expect(await screen.findByText('lease.extend')).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Aktor'), 'ADMIN');

  const adminTable = within(screen.getByRole('table'));
  expect(adminTable.queryByText('SYSTEM')).not.toBeInTheDocument();
  expect(adminTable.queryByText('appeal.submit')).not.toBeInTheDocument();
  expect(adminTable.getByText('lease.grant')).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Aktor'), 'SYSTEM');

  const systemTable = within(screen.getByRole('table'));
  expect(systemTable.getAllByText('SYSTEM').length).toBe(2);
  expect(systemTable.queryByText('lease.grant')).not.toBeInTheDocument();
});

it('renders the empty state when the log has no entries', async () => {
  server.use(http.get('/api/v1/audit', () => HttpResponse.json({ entries: [] })));

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
        : HttpResponse.json({ entries: auditFixture }),
    ),
  );
  const user = userEvent.setup();
  renderWithProviders(<AuditPage />);

  expect(await screen.findByText(API_ERROR)).toBeInTheDocument();

  isFailing = false;
  await user.click(screen.getByRole('button', { name: 'Odśwież' }));

  expect(await screen.findByText('lease.extend')).toBeInTheDocument();
});
