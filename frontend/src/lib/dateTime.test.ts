import { describe, expect, it } from 'vitest';

import {
  DAY_MS,
  daysRemaining,
  DISPLAY_TIME_ZONE,
  formatDateTimePl,
  formatDateTimeShortPl,
  formatDaysRemaining,
  formatOffsetDays,
} from '@/lib/dateTime';

const NOW = '2026-10-03T12:00:00Z';

describe('display constants', () => {
  it('pins the display time zone to Europe/Warsaw', () => {
    expect(DISPLAY_TIME_ZONE).toBe('Europe/Warsaw');
  });

  it('exposes the day length in milliseconds', () => {
    expect(DAY_MS).toBe(86_400_000);
  });
});

describe('formatDateTimePl', () => {
  it('formats an ISO timestamp as a long Polish date and time in the display time zone', () => {
    expect(formatDateTimePl('2026-10-03T13:24:00Z')).toBe('3 października 2026, 15:24');
  });

  it('applies the winter offset of the display time zone', () => {
    expect(formatDateTimePl('2026-01-05T08:05:00Z')).toBe('5 stycznia 2026, 09:05');
  });
});

describe('formatDateTimeShortPl', () => {
  it('formats an ISO timestamp as a compact Polish date and time in the display time zone', () => {
    expect(formatDateTimeShortPl('2026-10-03T13:24:00Z')).toBe('3 paź 2026, 15:24');
  });

  it.each(['', 'not-a-date', '2026-13-45T99:99:99Z'])(
    'returns an em dash for the malformed timestamp "%s" instead of throwing',
    (iso: string) => {
      expect(formatDateTimeShortPl(iso)).toBe('—');
    },
  );
});

describe('daysRemaining', () => {
  it('counts whole days between the simulated now and the expiry', () => {
    expect(daysRemaining('2026-10-10T12:00:00Z', NOW)).toBe(7);
  });

  it('rounds a partial day up', () => {
    expect(daysRemaining('2026-10-10T00:00:00Z', NOW)).toBe(7);
  });

  it('returns zero when the expiry equals the simulated now', () => {
    expect(daysRemaining(NOW, NOW)).toBe(0);
  });

  it('returns a negative count for an expired lease', () => {
    expect(daysRemaining('2026-09-30T12:00:00Z', NOW)).toBe(-3);
  });
});

describe('formatDaysRemaining', () => {
  it.each<[number | null, string]>([
    [12, 'Pozostało 12 dni'],
    [1, 'Pozostało 1 dzień'],
    [0, 'Wygasa dziś'],
    [-1, 'Wygasła 1 dzień temu'],
    [-3, 'Wygasła 3 dni temu'],
    [null, '—'],
  ])('formats %s days remaining as "%s"', (days: number | null, expected: string) => {
    expect(formatDaysRemaining(days)).toBe(expected);
  });

  it('uses an em dash for a lease without an expiry date', () => {
    expect(formatDaysRemaining(null).codePointAt(0)).toBe(0x2014);
  });
});

describe('formatOffsetDays', () => {
  it.each<[number, string]>([
    [15, '+15 dni'],
    [-15, '−15 dni'],
    [0, '0 dni'],
    [30, '+30 dni'],
    [1, '+1 dzień'],
    [-1, '−1 dzień'],
  ])('formats offset %s as "%s"', (offsetDays: number, expected: string) => {
    expect(formatOffsetDays(offsetDays)).toBe(expected);
  });

  it('uses the typographic minus sign for negative offsets', () => {
    expect(formatOffsetDays(-15).codePointAt(0)).toBe(0x2212);
  });
});

describe('formatDateTimePl with malformed input', () => {
  it('formats an ISO timestamp in the fixed display time zone', () => {
    expect(formatDateTimePl('2026-10-03T13:24:00Z')).toBe('3 października 2026, 15:24');
  });

  it.each(['', 'not-a-date', '2026-13-45T99:99:99Z'])(
    'returns an em dash for the malformed timestamp "%s" instead of throwing',
    (iso: string) => {
      expect(formatDateTimePl(iso)).toBe('—');
    },
  );
});
