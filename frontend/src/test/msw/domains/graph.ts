import teamsJson from '@shared/fixtures/teams.json';
import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import { buildGraphFixture } from '@/api/fixtures/graph';
import type { TeamRead } from '@/types/api';

import { getLeases } from '../state';

/**
 * Handlery domeny „graph” — mirror realnego backendu (`app/api/v1/graph.py` +
 * `insights_service.get_permission_graph`):
 *
 * - `GET /api/v1/graph` zwraca gotowy `PermissionGraph` (węzły zespołów, osób i repozytoriów oraz
 *   krawędzie `membership`/`lease`) w formacie React Flow,
 * - `?team=<slug>` zawęża graf do jednego zespołu (`build_graph_layout(..., team)`),
 * - nieznany slug to `404` — dokładnie jak `baseline_service.team_by_slug`.
 *
 * Graf budujemy z **żywego** stanu dostępów tym samym builderem co fixture, więc podróż w czasie
 * i decyzje administratora przenoszą statusy na krawędzie (i zapalają `animated`) zamiast
 * zostawiać graf zamrożony na dniu startowym. Widok jest tylko do odczytu — decyzje przechodzą
 * przez `/api/v1/leases/...` i `/api/v1/appeals/...`.
 */
const TEAM_SLUGS: string[] = (teamsJson as TeamRead[]).map((team: TeamRead): string => team.slug);

export const graphHandlers: HttpHandler[] = [
  http.get('/api/v1/graph', ({ request }) => {
    const team: string | null = new URL(request.url).searchParams.get('team');

    if (team !== null && !TEAM_SLUGS.includes(team)) {
      return HttpResponse.json({ detail: `Team ${team} not found` }, { status: 404 });
    }

    return HttpResponse.json(buildGraphFixture(getLeases(), team));
  }),
];
