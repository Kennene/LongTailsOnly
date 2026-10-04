import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { appealsFixture, auditFixture, baselineFixture, leasesFixture } from '@/api/fixtures';
import { AppealCandidatesTable } from '@/components/appeals/AppealCandidatesTable';
import { AppealList } from '@/components/appeals/AppealList';
import { AuditLogTable } from '@/components/audit/AuditLogTable';
import { OnboardingCard } from '@/components/baseline/OnboardingCard';
import { WarningWindowList } from '@/components/dashboard/WarningWindowList';
import { initialsFrom } from '@/lib/userInitials';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AppealOverview, LeaseOverview, OnboardingProposal, UserRead } from '@/types/api';

/**
 * Awatar („zdjęcie profilowe”) stoi przy każdej osobie, nie tylko w tabeli Dostępów: jak tam,
 * **za** nazwą i ukryty przed czytnikami (`aria-hidden`), bo nazwę niesie sąsiedni tekst.
 */
function expectAvatarAfter(container: HTMLElement, name: string, initials: string): void {
  const label: HTMLElement = within(container).getAllByText(name)[0];
  const avatar: HTMLElement = within(container).getAllByText(initials)[0];

  expect(avatar).toHaveAttribute('aria-hidden', 'true');
  expect(label.compareDocumentPosition(avatar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
}

const WARNING_USER: UserRead = leasesFixture.filter(
  (lease: LeaseOverview): boolean => lease.status === 'WARNING',
)[0].user;

describe('awatary przy osobach', () => {
  it('on the dashboard warning window', async () => {
    renderWithProviders(<WarningWindowList />);

    const section: HTMLElement = await screen.findByTestId('warning-window');
    await within(section).findAllByText(WARNING_USER.name);

    expectAvatarAfter(section, WARNING_USER.name, initialsFrom(WARNING_USER));
  });

  it('in the appeal candidates table', () => {
    const lease: LeaseOverview = leasesFixture[0];
    renderWithProviders(<AppealCandidatesTable leases={[lease]} />);

    expectAvatarAfter(screen.getByRole('table'), lease.user.name, initialsFrom(lease.user));
  });

  it('in the submitted appeals list', () => {
    const appeal: AppealOverview = appealsFixture[0];
    renderWithProviders(
      <>
        <h2 id="appeals-heading">Odwołania</h2>
        <AppealList appeals={[appeal]} labelledBy="appeals-heading" onResolve={vi.fn()} />
      </>,
    );

    expectAvatarAfter(
      screen.getByRole('list', { name: 'Odwołania' }),
      appeal.user.name,
      initialsFrom(appeal.user),
    );
  });

  it('next to a human actor in the audit log', () => {
    const entry = auditFixture.find((candidate) => candidate.actor_login !== null);
    if (entry === undefined || entry.actor_login === null) {
      throw new Error('Fixture audytu nie ma aktora z loginem');
    }
    renderWithProviders(<AuditLogTable entries={[entry]} />);

    const login: string = entry.actor_login;
    expectAvatarAfter(screen.getByRole('table'), login, initialsFrom({ name: login, login }));
  });

  it('in the onboarding card title', () => {
    const user: UserRead = leasesFixture[0].user;
    const proposal: OnboardingProposal = {
      user,
      team: { id: 1, name: 'DEV', slug: 'dev' } as OnboardingProposal['team'],
      to_grant: baselineFixture.dev ?? [],
      already_granted: [],
    };
    renderWithProviders(<OnboardingCard proposal={proposal} />);

    expectAvatarAfter(document.body, user.name, initialsFrom(user));
  });
});
