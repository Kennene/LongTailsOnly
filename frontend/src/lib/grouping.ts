/** Formy rzeczownika po liczebniku: „1 wpis”, „2 wpisy”, „5 wpisów”. */
export interface PolishNounForms {
  one: string;
  few: string;
  many: string;
}

/**
 * Elementy pod wspólnym kluczem; klucze w kolejności pierwszego wystąpienia, więc grupy
 * dziedziczą porządek listy wejściowej, dopóki wołający nie posortuje ich inaczej.
 */
export function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups: Map<K, T[]> = new Map();
  for (const item of items) {
    const key: K = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return groups;
}

/** Liczba z odmienionym rzeczownikiem — jedno źródło polskiej odmiany dla nagłówków grup. */
export function formatCountPl(count: number, forms: PolishNounForms): string {
  const lastDigit: number = count % 10;
  const lastTwoDigits: number = count % 100;
  if (count === 1) {
    return `1 ${forms.one}`;
  }
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return `${count} ${forms.few}`;
  }

  return `${count} ${forms.many}`;
}
