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

/** Operacja silnika, która zwróciła błąd — dobiera tabelę tłumaczeń. */
export type EngineOperation = 'LEASE_DECISION' | 'APPEAL_SUBMIT';

/** Zdanie po polsku dla administratora oraz `detail` serwera, gdy niesie treść wartą zachowania. */
export interface ApiErrorDescription {
  message: string;
  detail: string | null;
}

interface EngineErrorRule {
  status: number;
  /** Fragment angielskiego `detail` silnika (małymi literami); `null` łapie każdy taki status. */
  detailIncludes: string | null;
  message: string;
}

const DUPLICATE_JUSTIFICATION =
  'To uzasadnienie zostało już użyte przy innym odwołaniu. Podaj inne.';

/**
 * Błędy silnika po polsku, po statusie **i** treści `detail`: `decision_service` zwraca trzy różne
 * `422` (uzasadnienie, rola, termin) i dwa różne `409` (odwołanie `PENDING`, dostęp odebrany),
 * a `appeal_service` dwa różne `409` — sam status nie wystarcza, żeby je rozróżnić. Reguły czytamy
 * po angielskim komunikacie backendu (`A justification is required…`), a kolejność w tabeli
 * rozstrzyga remisy; reguła z `detailIncludes: null` jest zapasem dla całego statusu.
 */
const ENGINE_ERROR_RULES: Record<EngineOperation, EngineErrorRule[]> = {
  LEASE_DECISION: [
    {
      status: 403,
      detailIncludes: null,
      message: 'Nie można odebrać uprawnień ostatniemu administratorowi.',
    },
    {
      status: 409,
      detailIncludes: 'lease has a pending appeal',
      message: 'Ten dostęp ma nierozpatrzone odwołanie — najpierw je rozpatrz.',
    },
    {
      status: 409,
      detailIncludes: 'lease is already revoked',
      message: 'Ten dostęp jest już odebrany — nie ma czego zmieniać.',
    },
    {
      status: 422,
      detailIncludes: 'justification is required',
      message: 'Uzasadnienie jest wymagane do odebrania lub zdeeskalowania dostępu.',
    },
    {
      status: 422,
      detailIncludes: 'only a read or write lease can be extended',
      message: 'Tylko dostęp read/write można przedłużyć.',
    },
    {
      status: 422,
      detailIncludes: 'the new end of the lease must be later',
      message: 'Nowy termin musi być późniejszy niż obecny.',
    },
    {
      status: 422,
      detailIncludes: 'only an active write lease can be downscoped',
      message: 'Tylko aktywny dostęp write można zdeeskalować.',
    },
  ],
  APPEAL_SUBMIT: [
    {
      status: 409,
      detailIncludes: 'appeals are accepted only for revoked leases',
      message:
        'Odwołanie można złożyć tylko dla odebranego dostępu albo takiego, który wygasa w ciągu 7 dni.',
    },
    {
      status: 409,
      detailIncludes: 'pending appeal',
      message: 'Ten dostęp ma już nierozpatrzone odwołanie.',
    },
    {
      status: 422,
      detailIncludes: 'justification is required',
      message: 'Uzasadnienie jest wymagane',
    },
    {
      status: 422,
      detailIncludes: 'must be new',
      message: DUPLICATE_JUSTIFICATION,
    },
    // Każdy inny 409 z tego endpointu to powtórzone uzasadnienie (ADR 0005) — jak dotąd.
    { status: 409, detailIncludes: null, message: DUPLICATE_JUSTIFICATION },
  ],
};

/**
 * Tłumaczy błąd operacji silnika, zachowując `detail` serwera jako szczegół pod zdaniem.
 * Błąd bez reguły (np. `500`) wraca jako komunikat serwera, a bez komunikatu — jako `fallback`.
 */
export function describeEngineError(
  error: Error,
  operation: EngineOperation,
  fallback: string,
): ApiErrorDescription {
  if (error instanceof ApiError) {
    const detail: string = error.message.toLowerCase();
    const rule: EngineErrorRule | undefined = ENGINE_ERROR_RULES[operation].find(
      (candidate: EngineErrorRule): boolean =>
        candidate.status === error.status &&
        (candidate.detailIncludes === null || detail.includes(candidate.detailIncludes)),
    );

    if (rule !== undefined) {
      return { message: rule.message, detail: error.message };
    }
  }

  return { message: error.message.length > 0 ? error.message : fallback, detail: null };
}
