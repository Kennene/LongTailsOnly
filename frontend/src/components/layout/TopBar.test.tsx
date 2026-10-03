import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TopBar } from '@/components/layout/TopBar';
import { renderWithProviders } from '@/test/renderWithProviders';

/**
 * Regresja układu ze spec §10: nagłówek jest `justify-between` i ma **dokładnie dwoje** dzieci —
 * kontrolka usługi stoi w prawej grupie, bo trzecie dziecko konkurowałoby o miejsce z lewym
 * blokiem kontekstu.
 *
 * Pasek czasu symulowanego **nie** jest już częścią nagłówka: przeniósł się do widoku „Mocki”
 * razem z podglądem symulatorów, a jego własne zachowanie pinuje `components/mocks/
 * TimeTravelBar.test.tsx` i widok `pages/MocksPage.test.tsx`. Ten plik pilnuje wyłącznie układu.
 */
describe('TopBar', () => {
  it('keeps the header to two blocks with the picker as the right-hand one', async () => {
    renderWithProviders(<TopBar />);

    const header = await screen.findByRole('banner');
    // Jedyny bezpośredni dostęp do węzła w tym pliku: strażnik układu ze spec §10 dotyczy
    // **liczby dzieci** nagłówka, a zapytania testing-library opisują treść, nie strukturę.
    // eslint-disable-next-line testing-library/no-node-access
    const blocks = Array.from(header.children) as HTMLElement[];
    const rightGroup = blocks[1];

    expect(blocks).toHaveLength(2);
    expect(within(rightGroup).getByLabelText('Usługa')).toBeInTheDocument();
  });

  it('names the product rather than the integration', async () => {
    renderWithProviders(<TopBar />);

    // Usługa jest widoczna w kontrolce obok (spec §5.7), więc tytuł zostaje nazwą produktu.
    expect(await screen.findByText('Lease Governor')).toBeInTheDocument();
    expect(screen.getByText('Nadzór nad czasowym dostępem')).toBeInTheDocument();
  });
});
