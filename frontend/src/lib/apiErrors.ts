import { ApiError } from '@/api/client';

/**
 * Zamienia błąd API na zdanie po polsku (DESIGN.md §4: komunikaty błędów są stałe i zrozumiałe).
 *
 * Backend potrafi zwrócić techniczny albo angielski `detail` (np. `Justification already used`),
 * a panel jest w całości polski. Dla statusów, które mają ustalony sens biznesowy, pokazujemy
 * nasze zdanie; dla pozostałych zostaje komunikat serwera, a gdy go nie ma — `fallback`.
 */
export function describeApiError(error: Error, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Brak uprawnień do wykonania tej operacji.';
    }

    if (error.status === 409) {
      return 'To uzasadnienie zostało już użyte przy innym odwołaniu. Podaj inne.';
    }

    if (error.status === 404) {
      return 'Nie znaleziono zasobu — odśwież widok i spróbuj ponownie.';
    }
  }

  return error.message.length > 0 ? error.message : fallback;
}
