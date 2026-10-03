import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { appealsFixture } from '@/api/fixtures';
import type { AppealCreate, AppealOverview, AppealRejectRequest } from '@/types/api';

import { getLeases, getSimulatedNow } from '../state';

/**
 * Handlery domeny „appeals” — mirror realnego backendu (`backend/app/api/v1/appeals.py`):
 *
 * - `GET /api/v1/appeals` zwraca **gołą tablicę** `AppealOverview` i filtruje po `login`/`lease_id`,
 * - `POST /api/v1/appeals` odpowiada `201` i zwraca `AppealOverview` (z osobą i repozytorium),
 * - `POST /api/v1/appeals/{id}/reject` odrzuca wniosek (`REJECTED`, `resolved_at` z zegara
 *   symulowanego), `404` dla nieznanego id i `409` dla już rozstrzygniętego,
 * - endpointu `/decision` **nie ma** — zatwierdzenie czeka na decyzję o dostępie (3.6/5.5).
 *
 * Stan trzymamy w tym module (a nie w `../state.ts`). Ponieważ `setup.ts` czyści wyłącznie
 * `state.ts`, test woła `resetAppealsMswState()` w `beforeEach`.
 */

let appeals: AppealOverview[] = cloneAppeals();
let nextAppealId: number = appealsFixture.length + 1;
let lastAppealRequest: { lease_id: number; justification: string } | null = null;
let lastAppealRejection: { appeal_id: number; justification: string } | null = null;

function cloneAppeals(): AppealOverview[] {
  return appealsFixture.map((appeal: AppealOverview): AppealOverview => ({
    ...appeal,
    user: { ...appeal.user, team: appeal.user.team === null ? null : { ...appeal.user.team } },
    repository: { ...appeal.repository },
  }));
}

export function resetAppealsMswState(): void {
  appeals = cloneAppeals();
  nextAppealId = appealsFixture.length + 1;
  lastAppealRequest = null;
  lastAppealRejection = null;
}

/** Ostatnie żądanie `POST /api/v1/appeals`, jakie dotarło do „backendu” (albo `null`). */
export function getLastAppealRequest(): { lease_id: number; justification: string } | null {
  return lastAppealRequest;
}

/** Ostatnie żądanie `POST /api/v1/appeals/:id/reject` (albo `null`). */
export function getLastAppealRejection(): { appeal_id: number; justification: string } | null {
  return lastAppealRejection;
}

/** Odwołania tej samej osoby utworzone przed podanym `(created_at, id)` — jak w `appeal_service`. */
function countPreviousAppeals(user_id: number, created_at: string, id: number): number {
  return appeals.filter(
    (appeal: AppealOverview): boolean =>
      appeal.user_id === user_id &&
      (appeal.created_at < created_at || (appeal.created_at === created_at && appeal.id < id)),
  ).length;
}

export const appealsHandlers: HttpHandler[] = [
  http.get('/api/v1/appeals', ({ request }) => {
    const url = new URL(request.url);
    const login: string | null = url.searchParams.get('login');
    const leaseId: string | null = url.searchParams.get('lease_id');

    return HttpResponse.json(
      appeals.filter(
        (appeal: AppealOverview): boolean =>
          (login === null || appeal.user.login === login) &&
          (leaseId === null || appeal.lease_id === Number(leaseId)),
      ),
    );
  }),

  http.post('/api/v1/appeals', async ({ request }) => {
    const body = (await request.json()) as AppealCreate;
    lastAppealRequest = { lease_id: body.lease_id, justification: body.justification };

    // ADR 0005: każde odwołanie wymaga nowego, unikalnego uzasadnienia (intentional friction).
    if (
      appeals.some((appeal: AppealOverview): boolean => appeal.justification === body.justification)
    ) {
      return HttpResponse.json({ detail: 'Justification already used' }, { status: 409 });
    }

    const lease = getLeases().find((candidate) => candidate.id === body.lease_id);
    if (lease === undefined) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 });
    }

    const created: AppealOverview = {
      id: nextAppealId,
      lease_id: lease.id,
      user_id: lease.user.id,
      repo_id: lease.repository.id,
      requested_role: lease.current_role,
      justification: body.justification,
      status: 'PENDING',
      created_at: getSimulatedNow(),
      resolved_at: null,
      user: lease.user,
      repository: lease.repository,
      lease_role: lease.current_role,
      lease_expires_at: lease.expires_at,
      lease_is_active: lease.is_active,
      days_remaining: lease.is_active ? lease.days_remaining : null,
      previous_appeals: countPreviousAppeals(lease.user.id, getSimulatedNow(), nextAppealId),
      // Mock nie modeluje zdarzeń aktywności GitHuba, a backend liczy je z `ActivityEvent`.
      recent_activity_count: 0,
    };

    nextAppealId += 1;
    // Najnowsze pierwsze — widok renderuje listę w kolejności z API (bez liczenia dat).
    appeals = [created, ...appeals];

    return HttpResponse.json(created, { status: 201 });
  }),

  http.post('/api/v1/appeals/:appealId/reject', async ({ params, request }) => {
    const appealId = Number(params.appealId);
    const body = (await request.json()) as AppealRejectRequest;
    const index = appeals.findIndex((appeal: AppealOverview): boolean => appeal.id === appealId);

    if (index === -1) {
      return HttpResponse.json({ detail: `Appeal ${appealId} not found` }, { status: 404 });
    }
    if (appeals[index].status !== 'PENDING') {
      return HttpResponse.json({ detail: 'Appeal has already been resolved' }, { status: 409 });
    }

    lastAppealRejection = { appeal_id: appealId, justification: body.justification };

    // Czas bierzemy z symulowanego zegara — frontend nigdy nie używa zegara systemowego.
    const rejected: AppealOverview = {
      ...appeals[index],
      status: 'REJECTED',
      resolved_at: getSimulatedNow(),
    };
    appeals = appeals.map((appeal: AppealOverview): AppealOverview =>
      appeal.id === appealId ? rejected : appeal,
    );

    return HttpResponse.json(rejected);
  }),
];
