import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAppeals, postAppeal, postAppealDecision, rejectAppeal } from '@/api/appeals';
import { ApiError } from '@/api/client';
import { appealsFixture } from '@/api/fixtures';
import { getLastAppealDecision, resetAppealsMswState } from '@/test/msw/domains/appeals';
import { server } from '@/test/msw/server';
import { getLeases } from '@/test/msw/state';
import type { LeaseOverview } from '@/types/api';

/**
 * Warstwa danych odwołań (UC-3) — kontrakt realnego backendu (`backend/app/api/v1/appeals.py`):
 *
 * - `GET /api/v1/appeals` zwraca **gołą tablicę** `AppealOverview` (bez koperty `{ appeals }`),
 * - `POST /api/v1/appeals` odpowiada `201` i zwraca `AppealOverview`,
 * - `POST /api/v1/appeals/{id}/reject` odrzuca wniosek,
 * - `POST /api/v1/appeals/{id}/decision` rozstrzyga wniosek decyzją o dzierżawie (krok 4.3C):
 *   `EXTEND` zamyka go jako `APPROVED`, a `DOWNSCOPE`/`REVOKE` jako `REJECTED`
 *   (`backend/app/services/appeal_service.py`), a wniosek już rozstrzygnięty to `409`.
 *
 * Testujemy tutaj, bo te kształty łatwo „naprawić” po stronie komponentu (np. dodając kopertę),
 * a wtedy frontend rozjeżdża się z backendem po cichu.
 */

const UNIQUE_JUSTIFICATION = 'W przyszłym tygodniu prowadzę testy regresyjne wydania v2.1';

/**
 * Kandydat do odwołania (dostęp poza `ACTIVE`) z „backendu” MSW, a nie z literału w teście:
 * fixture'y dostępów są wspólne (`shared/fixtures/`) i zmieniają się razem z seedem.
 */
function appealableLease(): LeaseOverview {
  const lease: LeaseOverview | undefined = getLeases().find(
    (candidate: LeaseOverview): boolean => candidate.status !== 'ACTIVE',
  );
  if (lease === undefined) {
    throw new Error('Fixture dostępów nie zawiera kandydata do odwołania');
  }

  return lease;
}

beforeEach(() => {
  resetAppealsMswState();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchAppeals', () => {
  it('zwraca gołą tablicę odwołań z polami wyliczonymi przez backend', async () => {
    const appeals = await fetchAppeals();

    expect(Array.isArray(appeals)).toBe(true);
    expect(appeals).toHaveLength(appealsFixture.length);
    expect(appeals[0]).toMatchObject({
      id: appealsFixture[0].id,
      status: 'PENDING',
      user: { login: 'marta' },
      repository: { name: 'qa-automation' },
      lease_role: 'read',
      days_remaining: 2,
      previous_appeals: 0,
    });
  });

  it('przekazuje login i lease_id jako parametry zapytania', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/v1/appeals', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json([]);
      }),
    );

    await fetchAppeals({ lease_id: 5, login: 'marta' });

    expect(seen).toEqual(['?login=marta&lease_id=5']);
  });

  it('nie dokłada parametrów, gdy filtr jest pusty', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/v1/appeals', ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json([]);
      }),
    );

    await fetchAppeals();

    expect(seen).toEqual(['']);
  });

  it('czyta typowany fixture i filtruje go po lease_id, gdy fixture są włączone', async () => {
    vi.stubEnv('VITE_USE_FIXTURES', 'true');

    await expect(fetchAppeals()).resolves.toHaveLength(appealsFixture.length);
    await expect(fetchAppeals({ lease_id: 1 })).resolves.toEqual([appealsFixture[2]]);
  });
});

describe('postAppeal', () => {
  it('tworzy odwołanie i zwraca overview nowego wniosku', async () => {
    const lease: LeaseOverview = appealableLease();

    const created = await postAppeal(lease.id, UNIQUE_JUSTIFICATION);

    expect(created).toMatchObject({
      id: appealsFixture.length + 1,
      lease_id: lease.id,
      justification: UNIQUE_JUSTIFICATION,
      status: 'PENDING',
      resolved_at: null,
      user: { id: lease.user.id, login: lease.user.login },
      repository: { id: lease.repository.id, name: lease.repository.name },
      lease_role: lease.current_role,
      days_remaining: lease.days_remaining,
    });
  });
});

describe('rejectAppeal', () => {
  it('odrzuca odwołanie przez /reject i zwraca zaktualizowany overview', async () => {
    const rejected = await rejectAppeal(appealsFixture[0].id, 'Brak konkretnego planu użycia.');

    expect(rejected).toMatchObject({
      id: appealsFixture[0].id,
      status: 'REJECTED',
      justification: appealsFixture[0].justification,
    });
    expect(rejected.resolved_at).not.toBeNull();
  });

  it('zwraca 404 dla nieznanego identyfikatora odwołania', async () => {
    const error: unknown = await rejectAppeal(999, 'Brak konkretnego planu użycia.').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
  });
});

describe('postAppealDecision', () => {
  it('zatwierdza wniosek przedłużeniem i zwraca overview po decyzji', async () => {
    const decided = await postAppealDecision(1, {
      action: 'EXTEND',
      extension: { preset_days: 30 },
    });

    expect(decided).toMatchObject({ id: 1, status: 'APPROVED' });
    expect(decided.resolved_at).not.toBeNull();
    expect(getLastAppealDecision()).toEqual({
      appeal_id: 1,
      request: { action: 'EXTEND', extension: { preset_days: 30 } },
    });
  });

  it('zamyka wniosek jako odrzucony, gdy decyzja odbiera dostęp', async () => {
    const decided = await postAppealDecision(1, {
      action: 'REVOKE',
      justification: 'Brak dowodu użycia w oknie.',
    });

    expect(decided.status).toBe('REJECTED');
  });

  it('zwraca 409, gdy wniosek został już rozstrzygnięty', async () => {
    await rejectAppeal(1, 'Brak konkretnego planu użycia.');

    const error: unknown = await postAppealDecision(1, {
      action: 'EXTEND',
      extension: { preset_days: 30 },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409 });
  });
});
