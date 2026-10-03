import { useState } from 'react';

import { GraphFilters } from '@/components/graph/GraphFilters';
import { PermissionsGraph } from '@/components/graph/PermissionsGraph';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGraph } from '@/hooks/useGraph';
import { applyColumnLayout } from '@/lib/graphLayout';
import type { GraphEdge, GraphNode } from '@/types/api';

interface GraphSelection {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Etykieta zespołu dla sluga z węzła osoby.
 *
 * Kontrakt trzyma w `data.team` slug („dev”), a węzeł zespołu niesie nazwę („DEV”) — filtr musi
 * mówić jedną z tych wartości, więc bierzemy nazwę z węzła zespołu, a slug zostawiamy jako
 * ostatnią deskę ratunku dla odpowiedzi bez węzłów zespołów.
 */
function teamNameOf(nodes: GraphNode[], slug: string): string {
  return (
    nodes.find((node: GraphNode): boolean => node.type === 'team' && node.data.team === slug)?.data
      .label ?? slug
  );
}

/** Lista zespołów do filtra: etykiety węzłów `team` plus zespoły osób (po nazwie, nie po slugu). */
function collectTeams(nodes: GraphNode[]): string[] {
  const teams = new Set<string>();

  nodes.forEach((node: GraphNode): void => {
    if (node.type === 'team') {
      teams.add(node.data.label);
      return;
    }
    if (node.data.team !== null) {
      teams.add(teamNameOf(nodes, node.data.team));
    }
  });

  return [...teams].sort((left: string, right: string): number => left.localeCompare(right, 'pl'));
}

/**
 * Widok zawężony do jednego zespołu: węzeł zespołu, jego osoby i repozytoria, do których te osoby
 * mają czynne dzierżawy. Backend robi to samo po stronie `GET /api/v1/graph?team=…`
 * (`app/domain/insights.py::build_graph_layout`) — bez repozytoriów filtr pokazywałby ludzi
 * odciętych od tego, do czego mają dostęp.
 */
function selectTeam(nodes: GraphNode[], edges: GraphEdge[], team: string): GraphSelection {
  // `data.team` jest w kontrakcie `string | null`: węzeł zespołu bez sluga nie zawęża filtra.
  const teamSlug: string | undefined =
    nodes.find((node: GraphNode): boolean => node.type === 'team' && node.data.label === team)?.data
      .team ?? undefined;

  function inTeam(node: GraphNode): boolean {
    return teamSlug === undefined ? node.data.team === team : node.data.team === teamSlug;
  }

  const personIds = new Set<string>(
    nodes
      .filter((node: GraphNode): boolean => node.type === 'user' && inTeam(node))
      .map((node: GraphNode): string => node.id),
  );
  const repoIds = new Set<string>(
    edges
      .filter(
        (edge: GraphEdge): boolean => edge.data.kind === 'lease' && personIds.has(edge.source),
      )
      .map((edge: GraphEdge): string => edge.target),
  );
  const visible: GraphNode[] = nodes.filter((node: GraphNode): boolean =>
    node.type === 'team' || node.type === 'user' ? inTeam(node) : repoIds.has(node.id),
  );
  const visibleIds = new Set<string>(visible.map((node: GraphNode): string => node.id));

  return {
    nodes: visible,
    edges: edges.filter(
      (edge: GraphEdge): boolean => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    ),
  };
}

/** Ładowanie w docelowym układzie grafu (DESIGN.md §4), nigdy jako spinner. */
function GraphSkeleton(): React.JSX.Element {
  return <Skeleton className="h-[32rem] rounded-xl" data-testid="graph-skeleton" />;
}

/**
 * Widok `/graph`: relacje dostępu między zespołami, osobami i repozytoriami z `GET /api/v1/graph`.
 *
 * Układ kolumnowy liczymy raz, na pełnym zbiorze węzłów — dzięki temu zawężenie filtrów nie
 * przesuwa węzłów, a `applyColumnLayout` (idempotentny) nie nadpisuje `position` z API.
 */
export function GraphPage(): React.JSX.Element {
  const { data, isError, isPending, refetch } = useGraph();
  const [team, setTeam] = useState<string | null>(null);
  const [onlyRisk, setOnlyRisk] = useState<boolean>(false);

  const nodes = applyColumnLayout(data?.nodes ?? []);
  const edges = data?.edges ?? [];
  const selection: GraphSelection =
    team === null ? { nodes, edges } : selectTeam(nodes, edges, team);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Graf</h1>
        <p className="text-sm text-muted-foreground">
          Kto ma dostęp do czego: zespoły, osoby i repozytoria. Kolor węzła oraz krawędzi niesie
          status dzierżawy.
        </p>
      </header>

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Nie udało się pobrać grafu</AlertTitle>
          <AlertDescription>
            Sprawdź, czy backend odpowiada, a następnie spróbuj ponownie.
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(): void => {
                void refetch();
              }}
            >
              Odśwież
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {isPending ? <GraphSkeleton /> : null}

      {data === undefined ? null : (
        <>
          <GraphFilters
            onlyRisk={onlyRisk}
            onOnlyRiskChange={setOnlyRisk}
            onTeamChange={setTeam}
            team={team}
            teams={collectTeams(nodes)}
          />
          <PermissionsGraph edges={selection.edges} nodes={selection.nodes} onlyRisk={onlyRisk} />
        </>
      )}
    </section>
  );
}
