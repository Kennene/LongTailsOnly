import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import type { ApproveBaselineRequest } from '@/api/baseline';
import { findBaselineFixture } from '@/api/fixtures/baseline';

/** Ostatnie zatwierdzenie standardu, jakie przeszło przez MSW — dowód w testach (zadanie 5.7). */
export interface RecordedBaselineApproval {
  team_slug: string;
  body: ApproveBaselineRequest;
}

let lastBaselineApproval: RecordedBaselineApproval | null = null;

export function getLastBaselineApproval(): RecordedBaselineApproval | null {
  return lastBaselineApproval;
}

export function resetBaselineApproval(): void {
  lastBaselineApproval = null;
}

/**
 * Handlery domeny „baseline” (standard zespołu, onboarding UC-1). Zadanie 5.7.
 *
 * Odczyt zwraca fixture'y w kształcie oczekiwanego kontraktu 4.1. Zatwierdzenie tylko zapisuje
 * żądanie — dzierżawy dla nowego członka tworzy backend w kroku 4.2.
 */
export const baselineHandlers: HttpHandler[] = [
  http.get('/api/v1/baseline/:teamSlug', ({ params }) => {
    const response = findBaselineFixture(String(params.teamSlug));

    if (response === null) {
      return HttpResponse.json({ detail: 'Team baseline not found' }, { status: 404 });
    }

    return HttpResponse.json(response);
  }),

  http.post('/api/v1/baseline/:teamSlug/approve', async ({ params, request }) => {
    const body = (await request.json()) as ApproveBaselineRequest;
    lastBaselineApproval = { team_slug: String(params.teamSlug), body };

    return new HttpResponse(null, { status: 204 });
  }),
];
