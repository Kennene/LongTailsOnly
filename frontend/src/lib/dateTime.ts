export const DISPLAY_TIME_ZONE = 'Europe/Warsaw';
export const DAY_MS = 86_400_000;

const DATE_TIME_FORMATTER: Intl.DateTimeFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: 'long',
  timeStyle: 'short',
});

const TIME_PART_TYPES: ReadonlySet<string> = new Set([
  'hour',
  'minute',
  'second',
  'fractionalSecond',
  'dayPeriod',
]);

// `Intl` joins the pl-PL date and time with a plain space ("3 października 2026 15:24"),
// while the contract pins "3 października 2026, 15:24" — so we join the two halves ourselves.
export function formatDateTimePl(iso: string): string {
  const timestamp: number = Date.parse(iso);

  // Jeden zły znacznik czasu z backendu nie może wywalić całego widoku — aplikacja nie ma
  // error boundary, a `Intl.formatToParts(new Date(NaN))` rzuca `RangeError`.
  if (Number.isNaN(timestamp)) {
    return '—';
  }

  const parts: Intl.DateTimeFormatPart[] = DATE_TIME_FORMATTER.formatToParts(new Date(timestamp));
  const timeStart: number = parts.findIndex((part: Intl.DateTimeFormatPart): boolean =>
    TIME_PART_TYPES.has(part.type),
  );

  return `${joinPartValues(parts.slice(0, timeStart))}, ${joinPartValues(parts.slice(timeStart))}`;
}

function joinPartValues(parts: Intl.DateTimeFormatPart[]): string {
  return parts
    .map((part: Intl.DateTimeFormatPart): string => part.value)
    .join('')
    .trim();
}

function dayWord(days: number): string {
  return days === 1 ? 'dzień' : 'dni';
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) {
    return '—';
  }
  if (days === 0) {
    return 'Wygasa dziś';
  }
  if (days > 0) {
    return `Pozostało ${days} ${dayWord(days)}`;
  }
  return `Wygasła ${-days} ${dayWord(-days)} temu`;
}

export function formatOffsetDays(offset_days: number): string {
  if (offset_days === 0) {
    return `0 ${dayWord(0)}`;
  }
  const sign: string = offset_days > 0 ? '+' : '−';
  return `${sign}${Math.abs(offset_days)} ${dayWord(Math.abs(offset_days))}`;
}

export function daysRemaining(expires_at: string, now: string): number {
  return Math.ceil((Date.parse(expires_at) - Date.parse(now)) / DAY_MS);
}
