import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TopBar } from '@/components/layout/TopBar';
import { renderWithProviders } from '@/test/renderWithProviders';

/**
 * Regresja układu ze spec §10: nagłówek jest `justify-between` i ma **dokładnie dwoje** dzieci —
 * kontrolka usługi i slot paska czasu siedzą w jednej prawej grupie, bo trzecie dziecko
 * konkurowałoby o miejsce z lewym blokiem kontekstu.
 */
describe('TopBar', () => {
  it('keeps the picker and the time-travel slot in one right-hand group', async () => {
    renderWithProviders(<TopBar />);

    const header = await screen.findByRole('banner');
    // Jedyny bezpośredni dostęp do węzła w tym pliku: strażnik układu ze spec §10 dotyczy
    // **liczby dzieci** nagłówka, a zapytania testing-library opisują treść, nie strukturę.
    // eslint-disable-next-line testing-library/no-node-access
    const blocks = Array.from(header.children) as HTMLElement[];
    const rightGroup = blocks[1];

    expect(blocks).toHaveLength(2);
    expect(within(rightGroup).getByLabelText('Usługa')).toBeInTheDocument();
    expect(within(rightGroup).getByTestId('time-travel-bar')).toBeInTheDocument();
  });

  it('names the product rather than the integration', async () => {
    renderWithProviders(<TopBar />);

    // Usługa jest widoczna w kontrolce obok (spec §5.7), więc tytuł zostaje nazwą produktu.
    expect(await screen.findByText('Lease Governor')).toBeInTheDocument();
    expect(screen.getByText('Nadzór nad czasowym dostępem')).toBeInTheDocument();
  });
});
