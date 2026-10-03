import type { BaselineEntry, OnboardingProposal } from '@/types/api';

import { ApiError, getJson, postJson } from './client';
import { shouldUseFixtures } from './config';
import { findOnboardingFixture, findTeamBaselineFixture } from './fixtures/baseline';

/**
 * Standard zespołu i onboarding (UC-1) — jedyne miejsce styku z transportem.
 *
 * Ścieżki odwzorowują realne API v1 (ADR 0011 §4): standard zespołu to **goła** lista
 * `BaselineEntry` (bez koperty z zespołem i bez listy nowych członków), a onboarding zwraca
 * `OnboardingProposal` z podziałem na `to_grant` / `already_granted` dla jednego loginu.
 * Typy pochodzą z generowanego `src/types/api.ts`, więc rozjazd nazw pól jest błędem kompilacji.
 */

/** `GET /api/v1/teams/{slug}/baseline` — propozycje standardu zespołu (nigdy z rolą `admin`). */
export async function fetchTeamBaseline(team_slug: string): Promise<BaselineEntry[]> {
  if (shouldUseFixtures()) {
    return readTeamBaselineFixture(team_slug);
  }

  return getJson<BaselineEntry[]>(`/api/v1/teams/${team_slug}/baseline`);
}

/** `GET /api/v1/onboarding/{login}` — co zatwierdzenie standardu nada, a co osoba już ma. */
export async function fetchOnboarding(login: string): Promise<OnboardingProposal> {
  if (shouldUseFixtures()) {
    return readOnboardingFixture(login);
  }

  return getJson<OnboardingProposal>(`/api/v1/onboarding/${login}`);
}

/**
 * `POST /api/v1/onboarding/{login}/apply` — nadanie brakujących dostępów (idempotentne).
 *
 * Login jest w ścieżce, więc backend nie oczekuje ciała; `postJson` wysyła `{}`. Odpowiedzią jest
 * propozycja **po** nadaniu, dzięki czemu UI od razu widzi, co przeszło do `already_granted`.
 * Mutacje zawsze idą do API (`.env.example`), dlatego ta funkcja nie ma gałęzi fixture'owej.
 */
export async function applyOnboarding(login: string): Promise<OnboardingProposal> {
  return postJson<OnboardingProposal, Record<string, never>>(
    `/api/v1/onboarding/${login}/apply`,
    {},
  );
}

function readTeamBaselineFixture(team_slug: string): BaselineEntry[] {
  const entries = findTeamBaselineFixture(team_slug);

  if (entries === null) {
    throw new ApiError(404, `Brak fixture'a standardu dla zespołu ${team_slug}`);
  }

  return entries;
}

function readOnboardingFixture(login: string): OnboardingProposal {
  const proposal = findOnboardingFixture(login);

  if (proposal === null) {
    throw new ApiError(404, `Brak fixture'a onboardingu dla użytkownika ${login}`);
  }

  return proposal;
}
