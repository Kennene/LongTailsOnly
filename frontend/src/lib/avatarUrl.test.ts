import { describe, expect, it } from 'vitest';

import { avatarUrl } from '@/lib/avatarUrl';

describe('avatarUrl', () => {
  it('builds a deterministic illustration url for a login', () => {
    expect(avatarUrl('kamil')).toBe(
      'https://api.dicebear.com/9.x/personas/svg?seed=kamil&backgroundColor=transparent&size=48',
    );
  });

  it('gives two logins two different images', () => {
    expect(avatarUrl('kamil')).not.toBe(avatarUrl('marta'));
  });

  it('encodes a login that is not url-safe instead of breaking the query', () => {
    expect(avatarUrl('nowy dev')).toContain('seed=nowy%20dev');
  });

  it('asks for a square image at twice the css size, so it stays sharp on retina', () => {
    expect(avatarUrl('kamil')).toContain('size=48');
  });
});
