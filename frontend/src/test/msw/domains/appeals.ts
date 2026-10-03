import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { appealsFixture } from '@/api/fixtures';
import type { AppealCreate, AppealRead } from '@/types/api';

import { getLeases, getSimulatedNow } from '../state';

/**
 * Handlery domeny „appeals” (odwołania, historia, statystyki). Zadania 5.8a–5.8b.
 *
 * Stan trzymamy w tym module (a nie w `../state.ts`), żeby zadanie 5.8a nie dotykało pliku
 * współdzielonego z zadaniami 5.8b/5.10. Ponieważ `setup.ts` czyści wyłącznie `state.ts`,
 * test woła `resetAppealsMswState()` w `beforeEach`.
 */

let appeals: AppealRead[] = cloneAppeals();
let nextAppealId: number = appealsFixture.length + 1;
let lastAppealRequest: { lease_id: number; justification: string } | null = null;

function cloneAppeals(): AppealRead[] {
  return appealsFixture.map((appeal: AppealRead): AppealRead => ({ ...appeal }));
}

export function resetAppealsMswState(): void {
  appeals = cloneAppeals();
  nextAppealId = appealsFixture.length + 1;
  lastAppealRequest = null;
}

/** Ostatnie żądanie `POST /api/v1/appeals`, jakie dotarło do „backendu” (albo `null`). */
export function getLastAppealRequest(): { lease_id: number; justification: string } | null {
  return lastAppealRequest;
}

export const appealsHandlers: HttpHandler[] = [
  http.get('/api/v1/appeals', () => HttpResponse.json({ appeals })),

  http.post('/api/v1/appeals', async ({ request }) => {
    const body = (await request.json()) as AppealCreate;
    lastAppealRequest = { lease_id: body.lease_id, justification: body.justification };

    // ADR 0005: każde odwołanie wymaga nowego, unikalnego uzasadnienia (intentional friction).
    if (
      appeals.some((appeal: AppealRead): boolean => appeal.justification === body.justification)
    ) {
      return HttpResponse.json({ detail: 'Justification already used' }, { status: 409 });
    }

    const lease = getLeases().find((candidate) => candidate.id === body.lease_id);
    if (lease === undefined) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 });
    }

    const created: AppealRead = {
      id: nextAppealId,
      lease_id: lease.id,
      user_id: lease.user.id,
      repo_id: lease.repository.id,
      requested_role: lease.current_role,
      justification: body.justification,
      status: 'PENDING',
      created_at: getSimulatedNow(),
      resolved_at: null,
    };

    nextAppealId += 1;
    // Najnowsze pierwsze — widok renderuje listę w kolejności z API (bez liczenia dat).
    appeals = [created, ...appeals];

    return HttpResponse.json(created, { status: 201 });
  }),
];
