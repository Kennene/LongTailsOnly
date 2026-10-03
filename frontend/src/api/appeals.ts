import type { AppealCreate, AppealOverview, AppealRejectRequest } from '@/types/api';

import { getJson, postJson } from './client';
import { shouldUseFixtures } from './config';
import { appealsFixture } from './fixtures';

/**
 * Filtry listy odwołań — te same, które przyjmuje `GET /api/v1/appeals`
 * (`login`, `lease_id`; backend wspiera też `status`, ale UI go nie używa).
 */
export interface AppealsQuery {
  login?: string;
  lease_id?: number;
}

/** `AppealOverview` już niesie `user`, `repository` i liczniki — frontend nie dokłada niczego. */
export async function fetchAppeals(query: AppealsQuery = {}): Promise<AppealOverview[]> {
  if (shouldUseFixtures()) {
    return filterFixtureAppeals(query);
  }

  return getJson<AppealOverview[]>(`/api/v1/appeals${buildQueryString(query)}`);
}

export async function postAppeal(lease_id: number, justification: string): Promise<AppealOverview> {
  const appeal: AppealCreate = { lease_id, justification };

  return postJson<AppealOverview, AppealCreate>('/api/v1/appeals', appeal);
}

/**
 * Rozstrzygnięcie odwołania (UC-3): backend zna dziś **wyłącznie** odrzucenie wniosku
 * (`POST /api/v1/appeals/{appeal_id}/reject`, ADR 0011 §5.5). Endpoint `/decision` nie istnieje,
 * a zatwierdzenie wymaga decyzji o dzierżawie (3.6/5.5), której jeszcze nie ma.
 */
export async function rejectAppeal(
  appeal_id: number,
  justification: string,
): Promise<AppealOverview> {
  const body: AppealRejectRequest = { justification };

  return postJson<AppealOverview, AppealRejectRequest>(`/api/v1/appeals/${appeal_id}/reject`, body);
}

function buildQueryString(query: AppealsQuery): string {
  const search = new URLSearchParams();
  if (query.login !== undefined) {
    search.set('login', query.login);
  }
  if (query.lease_id !== undefined) {
    search.set('lease_id', String(query.lease_id));
  }

  const serialized: string = search.toString();
  return serialized.length === 0 ? '' : `?${serialized}`;
}

/** Fixture'y filtrujemy tak samo jak backend, żeby tryb bez backendu nie kłamał kształtem listy. */
function filterFixtureAppeals(query: AppealsQuery): AppealOverview[] {
  return appealsFixture.filter(
    (appeal: AppealOverview): boolean =>
      (query.login === undefined || appeal.user.login === query.login) &&
      (query.lease_id === undefined || appeal.lease_id === query.lease_id),
  );
}
