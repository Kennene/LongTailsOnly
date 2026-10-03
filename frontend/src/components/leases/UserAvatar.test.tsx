import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UserAvatar } from '@/components/leases/UserAvatar';
import { avatarUrl } from '@/lib/avatarUrl';
import { renderWithProviders } from '@/test/renderWithProviders';

const LOGIN = 'kamil';
const IMAGE: string = avatarUrl(LOGIN);

/** Obraz jest dekoracyjny (`aria-hidden`), więc pytamy o tag — roli w drzewie dostępności nie ma. */
function imageOf(container: HTMLElement): HTMLImageElement {
  // eslint-disable-next-line testing-library/no-node-access -- patrz wyżej
  const image: HTMLImageElement | null = container.querySelector('img');

  if (image === null) {
    throw new Error('Brak obrazu awatara');
  }

  return image;
}

/**
 * Rodzicielski krąg awatara. `closest()` jest tu jedynym sposobem dotarcia do niego: element nie ma
 * roli (rodzic dekoracyjnego obrazu), a jego treść to sam obraz. Jedno miejsce z wyłączoną regułą.
 */
function circleOf(container: HTMLElement): HTMLElement {
  // eslint-disable-next-line testing-library/no-node-access -- patrz wyżej
  const circle: HTMLElement | null = imageOf(container).closest('span');

  if (circle === null) {
    throw new Error('Brak kręgu awatara');
  }

  return circle;
}

describe('UserAvatar', () => {
  it('shows the initials until the picture arrives, so the cell is never blank', () => {
    const { container } = renderWithProviders(<UserAvatar initials="KA" login={LOGIN} />);

    expect(screen.getByText('KA')).toBeInTheDocument();
    expect(imageOf(container)).toHaveAttribute('src', IMAGE);
  });

  it('asks for the picture of the given login, and a different one for another login', () => {
    const { container } = renderWithProviders(<UserAvatar initials="KA" login={LOGIN} />);
    const first: string | null = imageOf(container).getAttribute('src');

    const view = renderWithProviders(<UserAvatar initials="MA" login="marta" />);

    expect(first).toBe(IMAGE);
    expect(imageOf(view.container).getAttribute('src')).not.toBe(first);
  });

  it('hides the picture from assistive tech: the name and login sit in the same cell', () => {
    const { container } = renderWithProviders(<UserAvatar initials="KA" login={LOGIN} />);

    expect(imageOf(container)).toHaveAttribute('aria-hidden', 'true');
  });

  it('drops the initials once the picture has loaded, so they do not show through', () => {
    const { container } = renderWithProviders(<UserAvatar initials="KA" login={LOGIN} />);

    fireEvent.load(imageOf(container));

    expect(screen.queryByText('KA')).not.toBeInTheDocument();
  });

  it('keeps the initials on screen when the picture fails, instead of breaking the row', () => {
    const { container } = renderWithProviders(<UserAvatar initials="KA" login={LOGIN} />);

    fireEvent.error(imageOf(container));

    expect(screen.getByText('KA')).toBeInTheDocument();
  });

  it('falls back to initials alone when the user has no login', () => {
    renderWithProviders(<UserAvatar initials="KA" />);

    expect(screen.getByText('KA')).toBeInTheDocument();
    expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument();
  });

  it('reserves a fixed round shape, so the 36–40 px row band survives a long name', () => {
    const { container } = renderWithProviders(<UserAvatar initials="KA" login={LOGIN} />);
    const classes: string = circleOf(container).getAttribute('class') ?? '';

    expect(classes).toContain('rounded-full');
    expect(classes).toMatch(/\bsize-\d/);
  });
});
