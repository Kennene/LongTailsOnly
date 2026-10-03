import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appealsFixture } from '@/api/fixtures';
import { AppealHistory } from '@/components/appeals/AppealHistory';
import { formatDateTimePl } from '@/lib/dateTime';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { AppealOverview } from '@/types/api';

// Fixture'y w kształcie kontraktu: `appealsFixture` jest już posortowany od najnowszego,
// a indeksy bierzemy z `shared/fixtures/appeals.json` (1: PENDING, 2: APPROVED, 3: REJECTED).
const pendingAppeal: AppealOverview = appealsFixture[0];
const rejectedAppeal: AppealOverview = appealsFixture[2];

const LONG_JUSTIFICATION =
  'Prowadzę release 2.1 modułu płatności i muszę dokończyć migrację konfiguracji środowisk ' +
  'przed zamrożeniem wydania; bez dostępu do repozytorium blokuję pracę trzech zespołów.';

const longJustificationAppeal: AppealOverview = {
  ...pendingAppeal,
  id: 99,
  justification: LONG_JUSTIFICATION,
};

describe('AppealHistory', () => {
  it('renders the date, the status label and the justification of every appeal', () => {
    renderWithProviders(<AppealHistory appeals={[pendingAppeal, rejectedAppeal]} />);

    expect(screen.getByText(formatDateTimePl(pendingAppeal.created_at))).toBeInTheDocument();
    expect(screen.getByText('Oczekujące')).toBeInTheDocument();
    expect(screen.getByText('Odrzucone')).toBeInTheDocument();
    expect(screen.getByText(pendingAppeal.justification)).toBeInTheDocument();
    expect(screen.getByText(rejectedAppeal.justification)).toBeInTheDocument();
  });

  it('keeps the API order, so the newest appeal stays on top', () => {
    renderWithProviders(<AppealHistory appeals={[pendingAppeal, rejectedAppeal]} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(pendingAppeal.justification);
    expect(items[1]).toHaveTextContent(rejectedAppeal.justification);
  });

  it('wraps a long justification instead of stretching the modal', () => {
    renderWithProviders(<AppealHistory appeals={[longJustificationAppeal]} />);

    expect(screen.getByText(LONG_JUSTIFICATION)).toHaveClass('break-words', 'max-w-prose');
  });

  it('renders the empty state when there are no appeals', () => {
    renderWithProviders(<AppealHistory appeals={[]} />);

    expect(screen.getByText('Brak odwołań')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
