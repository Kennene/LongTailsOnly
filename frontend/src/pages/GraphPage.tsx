import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { GraphFilters } from '@/components/graph/GraphFilters';
import { PermissionsGraph } from '@/components/graph/PermissionsGraph';
import { UserPicker } from '@/components/graph/UserPicker';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGraph } from '@/hooks/useGraph';
import { computeForceLayout, type LayoutPositions } from '@/lib/graphForceLayout';
import { nodeFromParams, selectionParamsOf } from '@/lib/graphHighlight';
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
 * Widok `/graph`: relacje dostępu między osobami, zespołami i repozytoriami jako pajęczyna.
 *
 * Węzły i krawędzie przychodzą gotowe z `GET /api/v1/graph` (`useGraph`) — razem z węzłami
 * zespołów i krawędziami członkostwa. Filtr zespołu jedzie do **backendu** jako `?team=<slug>`
 * (`app/domain/insights.py::build_graph_layout`), więc widok nie zawęża już niczego sam; pełny graf
 * trzymamy obok tylko po to, żeby lista zespołów w filtrze była kompletna.
 *
 * Układ pajęczyny (`computeForceLayout`) liczymy raz, na **pełnym** grafie — zawężenie do zespołu
 * nie przesuwa węzłów, a `position` z API (kolumny backendu) jest ignorowane. Zaznaczony węzeł
 * żyje w URL (`?user=kamil`, `?repo=…`, `?team=…`), więc link odtwarza stan widoku.
 */
export function GraphPage(): React.JSX.Element {
  const [team, setTeam] = useState<string | null>(null);
  const [onlyRisk, setOnlyRisk] = useState<boolean>(false);
  const [params, setParams] = useSearchParams();

  const allGraph = useGraph();
  const { data, isError, isPending, refetch } = useGraph(team);
  const allNodes: GraphNode[] = allGraph.data?.nodes ?? [];
  const nodes: GraphNode[] = data?.nodes ?? [];
  const edges: GraphEdge[] = data?.edges ?? [];
  const teams: TeamOption[] = collectTeams(allGraph.data);
  const positions: LayoutPositions = computeForceLayout(allNodes, allGraph.data?.edges ?? []);
  const selectedId: string | null = nodeFromParams(allNodes, params);
  const selectedUser: GraphNode | undefined = allNodes.find(
    (node: GraphNode): boolean => node.id === selectedId && node.type === 'user',
  );

  function select(nodeId: string | null): void {
    setParams(selectionParamsOf(allNodes, nodeId), { replace: true });
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mapa Dostępów</h1>
        <p className="text-sm text-muted-foreground">
          Kto ma dostęp do czego: osoby, zespoły i repozytoria. Kliknij węzeł albo wybierz osobę,
          żeby podświetlić jej drogi dostępu; obrys węzła i kolor krawędzi niosą status dostępu.
          Escape albo kliknięcie w tło czyści zaznaczenie.
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
          >
            {/* Klucz resetuje pole, gdy zaznaczenie zmieni się kliknięciem w graf albo Escape. */}
            <UserPicker
              key={selectedUser?.id ?? 'none'}
              initialLogin={selectedUser?.data.label ?? ''}
              onSelect={select}
              users={nodes.filter((node: GraphNode): boolean => node.type === 'user')}
            />
          </GraphFilters>
          <PermissionsGraph
            edges={edges}
            nodes={nodes}
            onlyRisk={onlyRisk}
            onSelect={select}
            positions={positions}
            selectedId={selectedId}
          />
        </>
      )}
    </section>
  );
}
