import repositoriesJson from '@shared/fixtures/repositories.json';
import teamsJson from '@shared/fixtures/teams.json';
import usersJson from '@shared/fixtures/users.json';

import { applyColumnLayout, type GraphNodeInput } from '@/lib/graphLayout';
import type {
  GraphEdge,
  GraphEdgeData,
  LeaseOverview,
  PermissionGraph,
  RepositoryRead,
  TeamRead,
  UserRead,
} from '@/types/api';

import { leasesFixture } from './leases';

/**
 * Graf uprawnień zbudowany ze **wspólnych** fixture'ów (`users`, `teams`, `repositories`, `leases`),
 * a nie z wymyślonej listy osób i repozytoriów.
 *
 * Reguły odwzorowują backend (`app/domain/insights.py::build_graph_layout` +
 * `PermissionGraph.from_layout`), więc graf nie rozjedzie się z tabelą dostępów: węzły to
 * zespoły, osoby i repozytoria, krawędź `membership` łączy osobę z zespołem, a krawędź `lease` —
 * osobę z repozytorium, niosąc rolę, status i rekomendację dostępu. `animated` zapala się dla
 * statusów wymagających reakcji (`WARNING`, `EXPIRED`).
 *
 * `position` jest w kontrakcie wymagane, więc dokładamy je od razu układem kolumnowym
 * z `lib/graphLayout.ts` — ten sam, którym widok ratuje odpowiedź bez `position`.
 *
 * `team` (slug) zawęża graf tak samo jak `GET /api/v1/graph?team=…`: zostają osoby tego zespołu,
 * ich czynne dzierżawy, repozytoria z tych dzierżaw oraz sam węzeł zespołu z krawędziami
 * członkostwa. Bez filtra repozytoria biorą się z całego `repositories.json`, tak jak backend
 * czyta wszystkie repozytoria z bazy.
 */
const TEAMS: TeamRead[] = teamsJson as TeamRead[];
const USERS: UserRead[] = usersJson as UserRead[];
const REPOSITORIES: RepositoryRead[] = repositoriesJson as RepositoryRead[];

export function buildGraphFixture(
  leases: LeaseOverview[],
  team: string | null = null,
): PermissionGraph {
  const members: UserRead[] = USERS.toSorted(compareMembers).filter(
    (member: UserRead): boolean => team === null || member.team?.slug === team,
  );
  const logins = new Set<string>(members.map((member: UserRead): string => member.login));
  const live: LeaseOverview[] = leases.filter(
    (lease: LeaseOverview): boolean => lease.is_active && logins.has(lease.user.login),
  );
  const teams: TeamRead[] = TEAMS.filter(
    (candidate: TeamRead): boolean => team === null || candidate.slug === team,
  );
  const repoNames: string[] = [
    ...new Set<string>([
      ...(team === null
        ? REPOSITORIES.map((repository: RepositoryRead): string => repository.name)
        : []),
      ...live.map((lease: LeaseOverview): string => lease.repository.name),
    ]),
  ].toSorted(compareStrings);

  const nodes: GraphNodeInput[] = [
    ...teams.map((teamRead: TeamRead): GraphNodeInput => ({
      id: `team:${teamRead.slug}`,
      type: 'team',
      data: { label: teamRead.name, team: teamRead.slug, is_admin: false },
    })),
    ...members.map((member: UserRead): GraphNodeInput => ({
      id: `user:${member.login}`,
      type: 'user',
      data: { label: member.login, team: member.team?.slug ?? null, is_admin: member.is_admin },
    })),
    ...repoNames.map((name: string): GraphNodeInput => ({
      id: `repo:${name}`,
      type: 'repo',
      data: { label: name, team: null, is_admin: false },
    })),
  ];

  const edges: GraphEdge[] = [
    ...members.flatMap((member: UserRead): GraphEdge[] =>
      member.team === null
        ? []
        : [
            {
              id: `member:${member.login}`,
              source: `team:${member.team.slug}`,
              target: `user:${member.login}`,
              label: null,
              animated: false,
              data: edgeData('membership'),
            },
          ],
    ),
    ...live.map((lease: LeaseOverview): GraphEdge => ({
      id: `lease:${lease.id}`,
      source: `user:${lease.user.login}`,
      target: `repo:${lease.repository.name}`,
      label: lease.current_role,
      animated: lease.status === 'WARNING' || lease.status === 'EXPIRED',
      data: {
        kind: 'lease',
        role: lease.current_role,
        status: lease.status,
        recommendation: lease.recommendation,
      },
    })),
  ];

  return { nodes: applyColumnLayout(nodes), edges };
}

/** Graf dla stanu z fixture'ów (tryb `VITE_USE_FIXTURES=true`). */
export const graphFixture: PermissionGraph = buildGraphFixture(leasesFixture);

function edgeData(kind: GraphEdgeData['kind']): GraphEdgeData {
  return { kind, role: null, status: null, recommendation: null };
}

/** Ta sama kolejność co backend: najpierw zespoły, w zespole po loginie, na końcu bez zespołu. */
function compareMembers(left: UserRead, right: UserRead): number {
  if ((left.team === null) !== (right.team === null)) {
    return left.team === null ? 1 : -1;
  }

  return (
    compareStrings(left.team?.slug ?? '', right.team?.slug ?? '') ||
    compareStrings(left.login, right.login)
  );
}

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
