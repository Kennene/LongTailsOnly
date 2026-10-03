import type { UserRead } from '@/types/api';

/**
 * Inicjały użytkownika do awatara — jedno źródło tej reguły w projekcie (`CODING_STANDARDS.md` §3,
 * „konsolidacja utilów w `src/lib/`”).
 *
 * Bierzemy litery z nazwy, a gdy ta nie daje **dwóch** liter — z loginu. Nazwa bywa jednym słowem
 * („Tomasz”), a wtedy jedna litera jest słabym znakiem rozpoznawczym przy piętnastu wierszach,
 * więc schodzimy do loginu: „Tomasz” → `TO` z `tomasz-admin`, „Tomasz (IT Security)” → `TI`
 * z samej nazwy. Pusty login zostawia to, co dała nazwa (`''`).
 */
export function initialsFrom(user: Pick<UserRead, 'name' | 'login'>): string {
  const fromName: string = initialsFromWords(user.name);

  return fromName.length >= 2 ? fromName : loginInitials(user.login);
}

/**
 * Pierwsze litery dwóch pierwszych słów nazwy, z pominięciem znaków, które literami nie są:
 * „Tomasz (IT Security)” daje `TI`, nie `T(`. Jedno słowo daje jedną literę — wtedy
 * `initialsFrom` schodzi do loginu.
 */
function initialsFromWords(value: string): string {
  const letters: string[] = value
    .split(/\s+/)
    .map((word: string): string => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word: string): boolean => word.length > 0)
    .map((word: string): string => Array.from(word)[0]);

  return letters.slice(0, 2).join('').toUpperCase();
}

/** Login to jedno słowo, więc bierzemy z niego pierwsze dwie litery (`kamil-dev` → `KA`). */
function loginInitials(login: string): string {
  return Array.from(login).slice(0, 2).join('').toUpperCase();
}
