import type { BaselineEntry, TeamRead } from '@/types/api';

import { ApiError, getJson, postJson } from './client';
import { shouldUseFixtures } from './config';
import { findBaselineFixture } from './fixtures/baseline';

/**
 * Standard zespołu (UC-1) — jedyne miejsce styku z transportem.
 *
 * Typy poniżej to **oczekiwany kontrakt kroków 4.1/4.2** (spec §5: „Zatwierdzenie standardu
 * + typ nowego członka — brak w kontrakcie 1.2”). Trzymamy je tutaj, a nie w generowanym
 * `src/types/api.ts`, bo ten plik jest generowany z Pydantic i nie edytujemy go ręcznie.
 * Gdy 4.1/4.2 dostarczy DTO, podmieniamy wyłącznie ten moduł: `BaselineEntry` już pochodzi
 * z kontraktu, więc rozjazd nazw pól w encji jest błędem kompilacji.
 */

/** Nowy członek zespołu bez dostępów — kandydat do zatwierdzenia standardu (krok 4.1). */
export interface NewMember {
  login: string;
  name: string;
}

/** Odpowiedź `GET /api/v1/baseline/{team_slug}` (krok 4.1). */
export interface BaselineResponse {
  team: TeamRead;
  entries: BaselineEntry[];
  new_members: NewMember[];
}

/** Ciało `POST /api/v1/baseline/{team_slug}/approve` (krok 4.2). */
export interface ApproveBaselineRequest {
  user_login: string;
}

/** Standard zespołu: propozycje dostępu (próg 50% aktywnych członków) i nowi członkowie. */
export async function fetchBaseline(team_slug: string): Promise<BaselineResponse> {
  if (shouldUseFixtures()) {
    return readFixture(team_slug);
  }

  return getJson<BaselineResponse>(`/api/v1/baseline/${team_slug}`);
}

/**
 * Zatwierdzenie standardu dla nowego członka jednym kliknięciem (UC-1).
 *
 * Ścieżka i ciało `{ user_login }` to ustalenie robocze z krokiem 4.2 — **do potwierdzenia**.
 * Jeśli backend wystawi inny kontrakt, zmienia się wyłącznie ta funkcja.
 */
export async function postApproveBaseline(team_slug: string, user_login: string): Promise<void> {
  await postJson<void, ApproveBaselineRequest>(`/api/v1/baseline/${team_slug}/approve`, {
    user_login,
  });
}

function readFixture(team_slug: string): BaselineResponse {
  const fixture = findBaselineFixture(team_slug);

  if (fixture === null) {
    throw new ApiError(404, `Brak fixture'a standardu dla zespołu ${team_slug}`);
  }

  return fixture;
}
