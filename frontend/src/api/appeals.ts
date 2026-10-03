import type { AppealCreate, AppealRead, DecisionRequest } from '@/types/api';

import { getJson, postJson } from './client';
import { shouldUseFixtures } from './config';
import { appealsFixture } from './fixtures';

/**
 * Odpowiedź listy odwołań.
 *
 * Kontrakt (`frontend/src/types/api.ts`, generowany z Pydantic) nie ma jeszcze DTO listy —
 * `GET /api/v1/appeals` dostarczy backend w kroku 4.4. Do tego czasu kształt
 * `{ appeals: AppealRead[] }` definiujemy tutaj, żeby po dostarczeniu endpointu zmienić
 * wyłącznie to miejsce (albo podmienić typ na generowany).
 */
export interface AppealsResponse {
  appeals: AppealRead[];
}

export async function fetchAppeals(): Promise<AppealsResponse> {
  if (shouldUseFixtures()) {
    return { appeals: appealsFixture };
  }

  return getJson<AppealsResponse>('/api/v1/appeals');
}

export async function postAppeal(lease_id: number, justification: string): Promise<AppealRead> {
  const appeal: AppealCreate = { lease_id, justification };

  return postJson<AppealRead, AppealCreate>('/api/v1/appeals', appeal);
}

/**
 * Rozpatrzenie odwołania (UC-3): ten sam `DecisionRequest` co decyzja o dzierżawie, ale
 * endpoint należy do domeny odwołań — dzięki temu backend rozstrzyga wniosek i dzierżawę
 * w jednej transakcji, a frontend nie musi składać dwóch żądań.
 */
export async function postResolveAppeal(
  appeal_id: number,
  request: DecisionRequest,
): Promise<AppealRead> {
  return postJson<AppealRead, DecisionRequest>(`/api/v1/appeals/${appeal_id}/decision`, request);
}
