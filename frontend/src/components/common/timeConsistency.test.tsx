import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { appealsFixture, auditFixture, clockFixture, leasesFixture } from '@/api/fixtures';
import { AppealCandidatesTable } from '@/components/appeals/AppealCandidatesTable';
import { AppealList } from '@/components/appeals/AppealList';
import { AuditLogTable } from '@/components/audit/AuditLogTable';
import { DecisionModal } from '@/components/leases/DecisionModal';
import { daysSince, formatDateTimePl, formatDaysAgo, formatOverdueDays } from '@/lib/dateTime';
import { OVERDUE_TEXT_CLASS } from '@/lib/statusBadges';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AppealOverview, AuditEntry, LeaseOverview } from '@/types/api';

/**
 * Jeden wzór czasu w całej aplikacji (jak w tabeli Dostępów):
 * - wygasły dostęp: czerwone „Po terminie X dni”, a wiersz osoby liczy wygasłe na czerwono,
 * - wiersz grupy pokazuje tylko, ile dni temu coś się stało; po rozwinięciu — dokładna data i wiek.
 */

const NOW: string = clockFixture.now;

const expiredLease: LeaseOverview | undefined = leasesFixture.find(
  (lease: LeaseOverview): boolean => lease.status === 'EXPIRED' && lease.days_remaining !== null,
);
if (expiredLease === undefined) {
  throw new Error('Fixture dostępów nie ma wygasłego dostępu');
}
const OVERDUE: string = formatOverdueDays(-(expiredLease.days_remaining ?? 0));

const overdueAppeal: AppealOverview = {
  ...appealsFixture[0],
  lease_is_active: true,
  days_remaining: -5,
};

function expectOverdue(container: HTMLElement, text: string): void {
  expect(within(container).getByText(text)).toHaveClass(OVERDUE_TEXT_CLASS);
}

describe('Odwołania — dostępy wymagające uwagi', () => {
  it('counts expired leases in red and shows "Po terminie X dni" in red after expanding', async () => {
    const user = userEvent.setup();
    const leases: LeaseOverview[] = leasesFixture.filter(
      (lease: LeaseOverview): boolean => lease.user.id === expiredLease.user.id,
    );
    renderWithProviders(<AppealCandidatesTable leases={leases} />);

    expect(within(screen.getByRole('table')).getByText(/wygasł/)).toHaveClass(OVERDUE_TEXT_CLASS);

    await user.click(screen.getByRole('button', { name: /^Pokaż dostępy: / }));

    expectOverdue(screen.getByRole('table'), OVERDUE);
  });
});

describe('Odwołania — złożone odwołania', () => {
  it('shows "X dni temu" on the person row and the exact date after expanding', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <h2 id="appeals">Odwołania</h2>
        <AppealList appeals={[overdueAppeal]} labelledBy="appeals" onResolve={vi.fn()} />
      </>,
    );
    const list: HTMLElement = screen.getByRole('list', { name: 'Odwołania' });
    const age: string = formatDaysAgo(daysSince(overdueAppeal.created_at, NOW));

    expect(await within(list).findByText(age)).toBeInTheDocument();
    expect(within(list).queryByText(formatDateTimePl(overdueAppeal.created_at))).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Pokaż odwołania: / }));

    expect(within(list).getByText(formatDateTimePl(overdueAppeal.created_at))).toBeInTheDocument();
    expectOverdue(list, 'Po terminie 5 dni');
  });
});

describe('Audyt', () => {
  it('shows "X dni temu" on the actor row and the exact time with its age on each entry', async () => {
    const user = userEvent.setup();
    const entry: AuditEntry = auditFixture[0];
    renderWithProviders(<AuditLogTable entries={[entry]} />);
    const table: HTMLElement = screen.getByRole('table');
    const age: string = formatDaysAgo(daysSince(entry.timestamp, NOW));

    const actorRow: HTMLElement = within(table).getAllByRole('row')[1];
    expect(await within(actorRow).findByText(age)).toBeInTheDocument();
    expect(within(actorRow).queryByText(formatDateTimePl(entry.timestamp))).toBeNull();

    await user.click(within(table).getByRole('button', { name: /^Pokaż wpisy: / }));

    const entryRow: HTMLElement = within(table).getAllByRole('row')[2];
    expect(within(entryRow).getByText(formatDateTimePl(entry.timestamp))).toBeInTheDocument();
    expect(within(entryRow).getByText(age)).toBeInTheDocument();
  });
});

describe('Modale decyzji', () => {
  it('shows "Po terminie X dni" in red for an expired lease', async () => {
    renderWithProviders(<DecisionModal lease={expiredLease} open onOpenChange={() => {}} />);

    expect(await screen.findByText(OVERDUE)).toHaveClass(OVERDUE_TEXT_CLASS);
  });

  it('shows "Po terminie X dni" in red for an appeal on an expired lease', async () => {
    renderWithProviders(
      <DecisionModal appeal={overdueAppeal} lease={null} open onOpenChange={() => {}} />,
    );

    expect(await screen.findByText('Po terminie 5 dni')).toHaveClass(OVERDUE_TEXT_CLASS);
  });

  it('adds the age to the last activity in the activity panel', async () => {
    renderWithProviders(<DecisionModal lease={expiredLease} open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('activity-window')).toHaveTextContent(/(dni|dzień) temu|dziś|brak/);
    });
  });
});
