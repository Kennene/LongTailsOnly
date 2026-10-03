import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { findTeamBaselineFixture, onboardingFixture } from '@/api/fixtures/baseline';
import type { OnboardingProposal } from '@/types/api';

/**
 * Handlery domeny „baseline” (standard zespołu, onboarding UC-1) — WYŁĄCZNIE infrastruktura
 * testowa. Odwzorowują realne API v1 (ADR 0011 §4):
 *
 * - `GET /api/v1/teams/{slug}/baseline` → **gołe** `BaselineEntry[]` (bez koperty z zespołem),
 * - `GET /api/v1/onboarding/{login}` → `OnboardingProposal`,
 * - `POST /api/v1/onboarding/{login}/apply` → `OnboardingProposal` po nadaniu, więc `to_grant`
 *   przechodzi do `already_granted` i drugi odczyt widzi standard jako nadany.
 *
 * Stan trzymamy w tym module (a nie w `../state.ts`), bo `setup.ts` czyści wyłącznie `state.ts` —
 * test woła `resetBaselineMswState()` w `beforeEach`.
 */

/** Ostatnie zatwierdzenie standardu, jakie przeszło przez MSW — dowód w testach (zadanie 5.7). */
export interface RecordedBaselineApproval {
  login: string;
}

let proposals: Record<string, OnboardingProposal | undefined> = cloneProposals();
let lastBaselineApproval: RecordedBaselineApproval | null = null;

function cloneProposals(): Record<string, OnboardingProposal | undefined> {
  const cloned: Record<string, OnboardingProposal | undefined> = {};

  for (const [login, proposal] of Object.entries(onboardingFixture)) {
    if (proposal === undefined) {
      continue;
    }

    cloned[login] = {
      ...proposal,
      to_grant: [...proposal.to_grant],
      already_granted: [...proposal.already_granted],
    };
  }

  return cloned;
}

export function getLastBaselineApproval(): RecordedBaselineApproval | null {
  return lastBaselineApproval;
}

export function resetBaselineMswState(): void {
  proposals = cloneProposals();
  lastBaselineApproval = null;
}

export const baselineHandlers: HttpHandler[] = [
  http.get('/api/v1/teams/:slug/baseline', ({ params }) => {
    const slug = String(params.slug);
    const entries = findTeamBaselineFixture(slug);

    if (entries === null) {
      return HttpResponse.json({ detail: `Team ${slug} not found` }, { status: 404 });
    }

    return HttpResponse.json(entries);
  }),

  http.get('/api/v1/onboarding/:login', ({ params }) => {
    const login = String(params.login);
    const proposal = proposals[login];

    if (proposal === undefined) {
      return HttpResponse.json({ detail: `User ${login} not found` }, { status: 404 });
    }

    return HttpResponse.json(proposal);
  }),

  http.post('/api/v1/onboarding/:login/apply', ({ params }) => {
    const login = String(params.login);
    const proposal = proposals[login];

    if (proposal === undefined) {
      return HttpResponse.json({ detail: `User ${login} not found` }, { status: 404 });
    }

    // Backend nadaje brakujące dostępy i zwraca propozycję po nadaniu (idempotentnie).
    lastBaselineApproval = { login };
    proposals[login] = {
      ...proposal,
      to_grant: [],
      already_granted: [...proposal.already_granted, ...proposal.to_grant],
    };

    return HttpResponse.json(proposals[login]);
  }),
];
