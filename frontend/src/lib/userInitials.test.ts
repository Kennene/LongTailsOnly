import { describe, expect, it } from 'vitest';

import { initialsFrom } from '@/lib/userInitials';
import type { UserRead } from '@/types/api';

/** Użytkownik z fixture'ów demo; tylko pola, których używa reguła inicjałów. */
function user(name: string, login: string): UserRead {
  return { id: 1, is_admin: false, login, name, team: null };
}

describe('initialsFrom', () => {
  it('takes the first letter of the first two words of the full name', () => {
    expect(initialsFrom(user('Tomasz (IT Security)', 'tomasz-admin'))).toBe('TI');
  });

  it('falls back to the login when the name has a single word', () => {
    expect(initialsFrom(user('Tomasz', 'tomasz-admin'))).toBe('TO');
  });

  it('falls back to the login when the name is empty', () => {
    expect(initialsFrom(user('', 'kamil-dev'))).toBe('KA');
  });

  it('ignores repeated whitespace between words', () => {
    expect(initialsFrom(user('  Anna   Maria  ', 'a-maria'))).toBe('AM');
  });

  it('takes the single character of a one-letter login', () => {
    expect(initialsFrom(user('', 'x'))).toBe('X');
  });

  it('returns nothing when the user has neither a name nor a login', () => {
    expect(initialsFrom(user('', ''))).toBe('');
  });
});
