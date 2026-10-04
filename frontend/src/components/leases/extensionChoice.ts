import type { Extension, LeaseOverview } from '@/types/api';

/**
 * Skróty nad polem „Liczba dni”. Klik wpisuje liczbę **do pola**, więc w modalu jest jeden
 * mechanizm przedłużenia i zawsze widać, ile dni pójdzie do silnika. Wysyłamy `custom_days`,
 * bo silnik przyjmuje jako `preset_days` tylko 7/14/30/90 — a skrót 60 dni też ma działać.
 */
export const QUICK_DAYS: number[] = [7, 30, 60];
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

/** Liczba dni z pola → `Extension` z jednym polem `custom_days`; `null` poza zakresem 1–365. */
export function buildExtension(days: string): Extension | null {
  const value = Number.parseInt(days, 10);
  if (!Number.isInteger(value) || value < CUSTOM_DAYS_MIN || value > CUSTOM_DAYS_MAX) {
    return null;
  }

  return { custom_days: value };
}
