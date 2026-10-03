export const DISPLAY_TIME_ZONE = 'Europe/Warsaw';
export const DAY_MS = 86_400_000;

const DATE_TIME_FORMATTER: Intl.DateTimeFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: 'long',
  timeStyle: 'short',
});

const SHORT_DATE_TIME_FORMATTER: Intl.DateTimeFormat = new Intl.DateTimeFormat('pl-PL', {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const TIME_PART_TYPES: ReadonlySet<string> = new Set([
  'hour',
  'minute',
  'second',
  'fractionalSecond',
  'dayPeriod',
]);

/** Pełna forma — pasek podróży w czasie, rejestr zdarzeń i modal decyzji. */
export function formatDateTimePl(iso: string): string {
  return formatWithSeparator(Date.parse(iso), DATE_TIME_FORMATTER);
}

/**
 * Forma skrócona („3 paź 2026, 15:24”) — **wyłącznie** dla gęstej tabeli dzierżaw, gdzie pełna
 * data w `font-mono` zjadała 67 px (kolumna 234 → 167 px, zmierzone w Chromium) i wypychała
 * kolumny decyzyjne poza ekran. Ten sam znacznik czasu i ten sam kontrakt odporności co
 * `formatDateTimePl`.
 */
export function formatDateTimeShortPl(iso: string): string {
  return formatWithSeparator(Date.parse(iso), SHORT_DATE_TIME_FORMATTER);
}

// `Intl` wstawia między datę i godzinę własny separator — w `dateStyle: 'long'` spację
// („3 października 2026 15:24”), a w `'medium'` przecinek („3 paź 2026, 15:24”). Kontrakt pinuje
// dokładnie „<data>, <godzina>”, więc literał z wzorca odrzucamy, a przecinek stawiamy raz sami.
function formatWithSeparator(timestamp: number, formatter: Intl.DateTimeFormat): string {
  // Jeden zły znacznik czasu z backendu nie może wywalić całego widoku — aplikacja nie ma
  // error boundary, a `Intl.formatToParts(new Date(NaN))` rzuca `RangeError`.
  if (Number.isNaN(timestamp)) {
    return '—';
  }

  const parts: Intl.DateTimeFormatPart[] = formatter.formatToParts(new Date(timestamp));
  const timeStart: number = parts.findIndex((part: Intl.DateTimeFormatPart): boolean =>
    TIME_PART_TYPES.has(part.type),
  );
  const dateEnd: number = parts[timeStart - 1]?.type === 'literal' ? timeStart - 1 : timeStart;

  return `${joinPartValues(parts.slice(0, dateEnd))}, ${joinPartValues(parts.slice(timeStart))}`;
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
