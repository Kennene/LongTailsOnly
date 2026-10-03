import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Natywny `<select>` maluje listę opcji poza CSS strony, więc tokeny motywu nie docierają do niej
 * same. Bez jawnego tła przeglądarka sięga po jasny motyw systemowy, a że opcje dziedziczą jasny
 * `color`, stają się nieczytelne (Audyt, Graf, Odwołania).
 *
 * jsdom nie renderuje natywnego popupu, więc jedynym automatyzowalnym strażnikiem jest kontrakt na
 * źródle arkusza (`import ... ?raw` pod Vite zwraca dla CSS pusty string — stąd odczyt z dysku):
 * opcje `<select>` mają jawnie dostać tokeny powierzchni `popover`, czyli to samo tło co popover.
 */
const STYLESHEET: string = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** Treść reguły o selektorze równym dokładnie `selector`; `undefined`, gdy reguły nie ma. */
function declarationsOf(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(STYLESHEET)?.[1];
}

describe('index.css', () => {
  it('paints native <select> options with the popover surface tokens', () => {
    const declarations = declarationsOf('select option');

    expect(
      declarations,
      'brak reguły `select option` — natywny popup wróci do jasnego tła systemowego',
    ).toBeDefined();
    expect(declarations).toMatch(/background-color:\s*var\(--popover\)/);
    expect(declarations).toMatch(/color:\s*var\(--popover-foreground\)/);
  });
});
