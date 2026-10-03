import { useState } from 'react';

import { GraphFilters } from '@/components/graph/GraphFilters';
import { PermissionsGraph } from '@/components/graph/PermissionsGraph';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGraph } from '@/hooks/useGraph';
import { applyColumnLayout } from '@/lib/graphLayout';
import type { GraphEdge, GraphNode, PermissionGraph } from '@/types/api';

/** Zespół w filtrze: `label` to nazwa z węzła (`DEV`), `slug` to wartość zapytania (`dev`). */
interface TeamOption {
  label: string;
  slug: string;
}

/**
 * Zespoły do filtra: węzły `team` z ładunku (`data.label` = nazwa, `data.team` = slug).
 *
 * Bierzemy je z **pełnego** grafu, bo `GET /api/v1/graph?team=…` zawęża odpowiedź do jednego
 * zespołu — lista opcji liczona z zawężonego grafu składałaby się do bieżącego wyboru i nie dałoby
 * się przełączyć na inny zespół bez wracania do „Wszystkie”.
 */
function collectTeams(graph: PermissionGraph | undefined): TeamOption[] {
  return (graph?.nodes ?? [])
    .filter((node: GraphNode): boolean => node.type === 'team' && node.data.team !== null)
    .map((node: GraphNode): TeamOption => ({ label: node.data.label, slug: node.data.team ?? '' }))
    .sort((left: TeamOption, right: TeamOption): number =>
      left.label.localeCompare(right.label, 'pl'),
    );
}

function slugOfLabel(teams: TeamOption[], label: string | null): string | null {
  return teams.find((option: TeamOption): boolean => option.label === label)?.slug ?? null;
}

function labelOfSlug(teams: TeamOption[], slug: string | null): string | null {
  return teams.find((option: TeamOption): boolean => option.slug === slug)?.label ?? null;
}

/** Ładowanie w docelowym układzie grafu (DESIGN.md §4), nigdy jako spinner. */
function GraphSkeleton(): React.JSX.Element {
  return <Skeleton className="h-[32rem] rounded-xl" data-testid="graph-skeleton" />;
}

/**
 * Widok `/graph`: relacje dostępu między osobami, zespołami i repozytoriami.
 *
 * Węzły i krawędzie przychodzą gotowe z `GET /api/v1/graph` (`useGraph`) — razem z węzłami
 * zespołów i krawędziami członkostwa. Filtr zespołu jedzie do **backendu** jako `?team=<slug>`
 * (`app/domain/insights.py::build_graph_layout`), więc widok nie zawęża już niczego sam; pełny graf
 * trzymamy obok tylko po to, żeby lista zespołów w filtrze była kompletna.
 *
 * Układ kolumnowy liczymy raz, na węzłach z API — `applyColumnLayout` (idempotentny) nie nadpisuje
 * `position` z odpowiedzi, a ratuje widok, gdyby pole jednak nie przyszło.
 */
export function GraphPage(): React.JSX.Element {
  const [team, setTeam] = useState<string | null>(null);
  const [onlyRisk, setOnlyRisk] = useState<boolean>(false);

  const allGraph = useGraph();
  const { data, isError, isPending, refetch } = useGraph(team);
  const nodes: GraphNode[] = applyColumnLayout(data?.nodes ?? []);
  const edges: GraphEdge[] = data?.edges ?? [];
  const teams: TeamOption[] = collectTeams(allGraph.data);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Graf</h1>
        <p className="text-sm text-muted-foreground">
          Kto ma dostęp do czego: osoby, zespoły i repozytoria. Kolor węzła oraz krawędzi niesie
          status dzierżawy, a filtr zespołu zawęża widok do jednej grupy.
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
            onTeamChange={(label: string | null): void => setTeam(slugOfLabel(teams, label))}
            team={labelOfSlug(teams, team)}
            teams={teams.map((option: TeamOption): string => option.label)}
          />
          <PermissionsGraph edges={edges} nodes={nodes} onlyRisk={onlyRisk} />
        </>
      )}
    </section>
  );
}
