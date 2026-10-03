import { applyColumnLayout, type GraphNodeInput } from '@/lib/graphLayout';
import type {
  GraphEdge,
  LeaseOverview,
  PermissionGraph,
  RepositoryRead,
  UserRead,
} from '@/types/api';

import { shouldUseFixtures } from './config';
import { graphFixture } from './fixtures/graph';
import { fetchLeases } from './leases';

/**
 * Graf uprawnień dla widoku `/graph`.
 *
 * Backend **nie serwuje** `GET /api/v1/graph` (krok 4.6B, plan
 * `docs/superpowers/plans/2026-10-03-p4-4.6-dashboard-graph.md`), więc w trybie live składamy
 * graf z danych, które API już oddaje — z listy dzierżaw (`GET /api/v1/leases`). Reguły
 * odwzorowują `app/domain/insights.py::build_graph_layout`:
 *
 * - węzły to osoby i repozytoria z **czynnych** dzierżaw; nieaktywne pomijamy tak samo jak
 *   backend (odebrany dostęp nie jest już krawędzią w grafie),
 * - każda czynna dzierżawa to jedna krawędź `lease` z rolą, statusem i rekomendacją; `animated`
 *   zapala się dla `WARNING`/`EXPIRED`,
 * - identyfikatory są stabilne między odświeżeniami: `user:<id>`, `repo:<id>`, `lease:<id>`,
 * - `position` dokłada układ kolumnowy (`lib/graphLayout.ts`), bo kontrakt wymaga go w węźle.
 *
 * **Zespołów tu nie ma i to jest poprawne**: lista dzierżaw niesie tylko `user.team` osoby, która
 * dzierżawę ma — nie niesie składu zespołu. Węzeł `team:<slug>` z krawędziami `membership` dla
 * samych posiadaczy dzierżaw kłamałby o członkostwie (pokazywałby część zespołu jako cały zespół),
 * więc zespoły zostają tam, gdzie payload je naprawdę niesie: na węźle osoby (`data.team` = slug),
 * z którego korzysta filtr w widoku. Graf z węzłami zespołów wróci razem z 4.6B.
 */
export async function fetchGraph(): Promise<PermissionGraph> {
  if (shouldUseFixtures()) {
    return graphFixture;
  }

  return buildLeaseGraph(await fetchLeases());
}

/** Graf z listy dzierżaw — jedyne źródło węzłów i krawędzi, gdy backend nie ma jeszcze 4.6B. */
export function buildLeaseGraph(leases: LeaseOverview[]): PermissionGraph {
  const live: LeaseOverview[] = leases.filter((lease: LeaseOverview): boolean => lease.is_active);
  const users: UserRead[] = uniqueUsers(live);
  const repositories: RepositoryRead[] = uniqueRepositories(live);

  const nodes: GraphNodeInput[] = [
    ...users.map((user: UserRead): GraphNodeInput => ({
      id: `user:${user.id}`,
      type: 'user',
      data: { label: user.login, team: user.team?.slug ?? null, is_admin: user.is_admin },
    })),
    ...repositories.map((repository: RepositoryRead): GraphNodeInput => ({
      id: `repo:${repository.id}`,
      type: 'repo',
      data: { label: repository.name, team: null, is_admin: false },
    })),
  ];

  const edges: GraphEdge[] = live.map((lease: LeaseOverview): GraphEdge => ({
    id: `lease:${lease.id}`,
    source: `user:${lease.user.id}`,
    target: `repo:${lease.repository.id}`,
    label: lease.current_role,
    animated: lease.status === 'WARNING' || lease.status === 'EXPIRED',
    data: {
      kind: 'lease',
      role: lease.current_role,
      status: lease.status,
      recommendation: lease.recommendation,
    },
  }));

  return { nodes: applyColumnLayout(nodes), edges };
}

/** Osoby z dzierżaw, bez powtórzeń, w kolejności backendu (zespół → login, na końcu bez zespołu). */
function uniqueUsers(live: LeaseOverview[]): UserRead[] {
  const byId: Map<number, UserRead> = new Map<number, UserRead>();
  live.forEach((lease: LeaseOverview): void => {
    byId.set(lease.user.id, lease.user);
  });

  return [...byId.values()].toSorted(compareUsers);
}

/** Repozytoria z dzierżaw, bez powtórzeń, po nazwie — jak `build_graph_layout` (`sorted(repos)`). */
function uniqueRepositories(live: LeaseOverview[]): RepositoryRead[] {
  const byId: Map<number, RepositoryRead> = new Map<number, RepositoryRead>();
  live.forEach((lease: LeaseOverview): void => {
    byId.set(lease.repository.id, lease.repository);
  });

  return [...byId.values()].toSorted(compareRepositories);
}

function compareUsers(left: UserRead, right: UserRead): number {
  if ((left.team === null) !== (right.team === null)) {
    return left.team === null ? 1 : -1;
  }

  return (
    compareStrings(left.team?.slug ?? '', right.team?.slug ?? '') ||
    compareStrings(left.login, right.login)
  );
}

function compareRepositories(left: RepositoryRead, right: RepositoryRead): number {
  return compareStrings(left.name, right.name);
}

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
