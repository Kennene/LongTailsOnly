import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/client';
import { describeApiError, describeEngineError } from '@/lib/apiErrors';

/**
 * Tabela tłumaczeń błędów silnika (`apiErrors.ts`). Silnik odpowiada po angielsku
 * (`decision_service.py`, `appeal_service.py`), a panel jest w całości polski — mapper jest
 * jedynym miejscem, w którym te zdania powstają, więc każdy wiersz tabeli ma tu swoją asercję.
 */

const FALLBACK = 'Nie udało się wykonać operacji.';

const DECISION_CASES: [number, string, string][] = [
  [
    403,
    'Cannot remove the last administrator of the repository/organization',
    'Nie można odebrać uprawnień ostatniemu administratorowi.',
  ],
  [
    409,
    'Lease has a pending appeal; decide it via /api/v1/appeals/7/decision',
    'Ten dostęp ma nierozpatrzone odwołanie — najpierw je rozpatrz.',
  ],
  [409, 'Lease is already revoked', 'Ten dostęp jest już odebrany — nie ma czego zmieniać.'],
  [
    422,
    'A justification is required to downscope or revoke access',
    'Uzasadnienie jest wymagane do odebrania lub zdeeskalowania dostępu.',
  ],
  [422, 'Only a read or write lease can be extended', 'Tylko dostęp read/write można przedłużyć.'],
  [
    422,
    'The new end of the lease must be later than the current one',
    'Nowy termin musi być późniejszy niż obecny.',
  ],
  [
    422,
    'Only an active write lease can be downscoped to read',
    'Tylko aktywny dostęp write można zdeeskalować.',
  ],
];

const APPEAL_CASES: [number, string, string][] = [
  [
    409,
    'Appeals are accepted only for revoked leases or leases expiring within 7 days',
    'Odwołanie można złożyć tylko dla odebranego dostępu albo takiego, który wygasa w ciągu 7 dni.',
  ],
  [409, 'This lease already has a pending appeal', 'Ten dostęp ma już nierozpatrzone odwołanie.'],
  [
    422,
    'Justification must be new; previous justifications cannot be reused',
    'To uzasadnienie zostało już użyte przy innym odwołaniu. Podaj inne.',
  ],
  [422, 'Justification is required', 'Uzasadnienie jest wymagane'],
];

describe('describeEngineError — decyzja o dostępie', () => {
  it.each(DECISION_CASES)('tłumaczy %i: %s', (status, detail, message) => {
    expect(describeEngineError(new ApiError(status, detail), 'LEASE_DECISION', FALLBACK)).toEqual({
      message,
      detail,
    });
  });

  it('zostawia komunikat serwera, gdy status nie ma reguły', () => {
    const described = describeEngineError(
      new ApiError(500, 'Baza danych jest niedostępna'),
      'LEASE_DECISION',
      FALLBACK,
    );

    expect(described).toEqual({ message: 'Baza danych jest niedostępna', detail: null });
  });

  it('nie tłumaczy 409 o nieznanej przyczynie na żadne ze zdań silnika', () => {
    const described = describeEngineError(
      new ApiError(409, 'Repository is locked'),
      'LEASE_DECISION',
      FALLBACK,
    );

    expect(described).toEqual({ message: 'Repository is locked', detail: null });
  });

  it('używa zapasowego zdania, gdy błąd nie niesie komunikatu', () => {
    expect(describeEngineError(new Error(''), 'LEASE_DECISION', FALLBACK)).toEqual({
      message: FALLBACK,
      detail: null,
    });
  });
});

describe('describeEngineError — złożenie odwołania', () => {
  it.each(APPEAL_CASES)('tłumaczy %i: %s', (status, detail, message) => {
    expect(describeEngineError(new ApiError(status, detail), 'APPEAL_SUBMIT', FALLBACK)).toEqual({
      message,
      detail,
    });
  });

  it('traktuje każde inne 409 z tego endpointu jak powtórzone uzasadnienie (ADR 0005)', () => {
    const described = describeEngineError(
      new ApiError(409, 'Justification already used'),
      'APPEAL_SUBMIT',
      FALLBACK,
    );

    expect(described.message).toBe(
      'To uzasadnienie zostało już użyte przy innym odwołaniu. Podaj inne.',
    );
  });
});

describe('describeApiError', () => {
  /** `AppealsPage` i `DecisionModalAppeal` wołają ten mapper dla zapytań i odrzucenia odwołania. */
  it('zachowuje dotychczasowe mapowanie po statusie', () => {
    expect(describeApiError(new ApiError(409, 'Justification already used'), FALLBACK)).toBe(
      'To uzasadnienie zostało już użyte przy innym odwołaniu. Podaj inne.',
    );
    expect(describeApiError(new ApiError(403, 'Forbidden'), FALLBACK)).toBe(
      'Brak uprawnień do wykonania tej operacji.',
    );
    expect(describeApiError(new ApiError(500, 'Baza danych jest niedostępna'), FALLBACK)).toBe(
      'Baza danych jest niedostępna',
    );
  });
});
