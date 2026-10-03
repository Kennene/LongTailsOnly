import type { Extension, LeaseOverview } from '@/types/api';

export type PresetDays = 7 | 14 | 30 | 90;
export type Multiplier = 1.5 | 2;

/** Dokładnie jeden wariant przedłużenia wybierany w modalu (ADR 0005). */
export type ExtensionChoice =
  | { kind: 'preset'; days: PresetDays }
  | { kind: 'multiplier'; multiplier: Multiplier }
  | { kind: 'custom' }
  | { kind: 'date'; date: string };

export const PRESET_DAYS: PresetDays[] = [7, 14, 30, 90];
export const MULTIPLIERS: Multiplier[] = [1.5, 2];
export const CUSTOM_DAYS_MIN = 1;
export const CUSTOM_DAYS_MAX = 365;
export const CUSTOM_DAYS_ERROR = 'Podaj liczbę dni z zakresu 1–365';
export const ADMIN_EXTENSION_BLOCKED =
  'Dostęp administratora nie wygasa — nie można go przedłużyć.';

/**
 * Powód, dla którego sekcja przedłużania jest niedostępna, albo `null`, gdy `EXTEND` przejdzie.
 *
 * Silnik odrzuca `EXTEND` na dostępie administratora (`decision_service.extend_lease`:
 * `lease.current_role is Role.ADMIN` → 422 `Only a read or write lease can be extended`), a taka
 * dostęp nigdy nie wygasa (ADR 0002). Reguła jest **rolowa**, nie statusowa: `PERMANENT` bez
 * roli admina (brak terminu) silnik nadal przedłuża, bo liczy nowy koniec od `now`.
 */
export function extensionBlockedReason(lease: LeaseOverview): string | null {
  return lease.current_role === 'admin' ? ADMIN_EXTENSION_BLOCKED : null;
}

/** Lokalna data kalendarza → `YYYY-MM-DD`, czyli kontraktowe `Extension.until_date`. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatMultiplier(multiplier: Multiplier): string {
  return `${String(multiplier).replace('.', ',')}x`;
}

/** Buduje `Extension` z dokładnie jednym polem; `null` dla niepełnej liczby dni własnych. */
export function buildExtension(choice: ExtensionChoice, customDays: string): Extension | null {
  if (choice.kind === 'preset') {
    return { preset_days: choice.days };
  }
  if (choice.kind === 'multiplier') {
    return { multiplier: choice.multiplier };
  }
  if (choice.kind === 'date') {
    return { until_date: choice.date };
  }

  const days = Number.parseInt(customDays, 10);
  if (!Number.isInteger(days) || days < CUSTOM_DAYS_MIN || days > CUSTOM_DAYS_MAX) {
    return null;
  }

  return { custom_days: days };
}

export function isPresetChosen(choice: ExtensionChoice | null, days: PresetDays): boolean {
  return choice?.kind === 'preset' && choice.days === days;
}

export function isMultiplierChosen(
  choice: ExtensionChoice | null,
  multiplier: Multiplier,
): boolean {
  return choice?.kind === 'multiplier' && choice.multiplier === multiplier;
}
