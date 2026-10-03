import { useState } from 'react';

import type { GraphNode } from '@/api/graph';
import { GraphFilters } from '@/components/graph/GraphFilters';
import { PermissionsGraph } from '@/components/graph/PermissionsGraph';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGraph } from '@/hooks/useGraph';
import { applyColumnLayout } from '@/lib/graphLayout';

/** Lista zespołów do filtra: `data.team` osób oraz etykiety węzłów typu `team`. */
function collectTeams(nodes: GraphNode[]): string[] {
  const teams = new Set<string>();

  nodes.forEach((node: GraphNode): void => {
    if (node.type === 'team') {
      teams.add(node.data.label);
    } else if (node.data.team !== undefined) {
      teams.add(node.data.team);
    }
  });

  return [...teams].sort((left: string, right: string): number => left.localeCompare(right, 'pl'));
}

function filterByTeam(nodes: GraphNode[], team: string): GraphNode[] {
  return nodes.filter((node: GraphNode): boolean =>
    node.type === 'team' ? node.data.label === team : node.data.team === team,
  );
}

/** Ładowanie w docelowym układzie grafu (DESIGN.md §4), nigdy jako spinner. */
function GraphSkeleton(): React.JSX.Element {
  return <Skeleton className="h-[32rem] rounded-xl" data-testid="graph-skeleton" />;
}

/**
 * Widok `/graph`: relacje dostępu między osobami, zespołami i repozytoriami z `GET /api/v1/graph`.
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
  const visibleNodes = team === null ? nodes : filterByTeam(nodes, team);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Graf</h1>
        <p className="text-sm text-muted-foreground">
          Kto ma dostęp do czego: osoby, zespoły i repozytoria. Kolor węzła oraz krawędzi niesie
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
          <PermissionsGraph edges={edges} nodes={visibleNodes} onlyRisk={onlyRisk} />
        </>
      )}
    </section>
  );
}
