import type { GraphEdge, GraphNode, LeaseStatus, Recommendation, Role } from '@/types/api';

/** Podświetlony podgraf: węzły i krawędzie, które zostają w pełnym kolorze; reszta wygasa. */
export interface GraphHighlight {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Wiersz panelu szczegółów: drugi koniec relacji (repo osoby, osoba z dostępem do repo albo
 * członek zespołu) z rolą, statusem i rekomendacją dostępu. Członek zespołu nie ma jednego
 * dostępu, więc dostaje najgorszy status ze swoich dostępów, a rola i rekomendacja są `null`.
 */
export interface AccessRow {
  id: string;
  label: string;
  role: Role | null;
  status: LeaseStatus | null;
  recommendation: Recommendation | null;
}

/** Klucz parametru URL dla zaznaczonego węzła — `?user=kamil`, `?repo=core-api`, `?team=DEV`. */
export type SelectionParams = Partial<Record<GraphNode['type'], string>>;

/** Statusy, które znaczą „podwyższone ryzyko” (spec §7.6) — filtr ryzyka i licznik ostrzeżeń. */
const RISK_STATUSES: readonly LeaseStatus[] = ['WARNING', 'EXPIRED'];

/** Od najgroźniejszego: kolejność wierszy panelu i najgorszy status węzła. */
const STATUS_SEVERITY: readonly LeaseStatus[] = [
  'EXPIRED',
  'WARNING',
  'ACTIVE',
  'PERMANENT',
  'REVOKED',
];

const RECOMMENDATION_SEVERITY: readonly Recommendation[] = ['REVOKE', 'DOWNSCOPE', 'KEEP'];

/** Kolejność odczytu parametrów URL, gdy w adresie jest ich kilka. */
const PARAM_ORDER: readonly GraphNode['type'][] = ['user', 'repo', 'team'];

export function isElevatedRisk(status: LeaseStatus | null): boolean {
  return status !== null && RISK_STATUSES.includes(status);
}

/** Najgorszy z dwóch statusów wg `STATUS_SEVERITY` (`null` przegrywa z każdym statusem). */
export function worseStatus(
  current: LeaseStatus | null,
  candidate: LeaseStatus | null,
): LeaseStatus | null {
  return rank(STATUS_SEVERITY, candidate) < rank(STATUS_SEVERITY, current) ? candidate : current;
}

function rank<T>(order: readonly T[], value: T | null): number {
  return value === null ? order.length : order.indexOf(value);
}

function emptyHighlight(): GraphHighlight {
  return { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
}

function addEdge(highlight: GraphHighlight, edge: GraphEdge): void {
  highlight.edgeIds.add(edge.id);
  highlight.nodeIds.add(edge.source);
  highlight.nodeIds.add(edge.target);
}

function touches(edge: GraphEdge, nodeId: string): boolean {
  return edge.source === nodeId || edge.target === nodeId;
}

function leasesOf(edges: GraphEdge[], userId: string): GraphEdge[] {
  return edges.filter(
    (edge: GraphEdge): boolean => edge.data.kind === 'lease' && edge.source === userId,
  );
}

function membersOf(edges: GraphEdge[], teamId: string): GraphEdge[] {
  return edges.filter(
    (edge: GraphEdge): boolean => edge.data.kind === 'membership' && touches(edge, teamId),
  );
}

function otherEnd(edge: GraphEdge, nodeId: string): string {
  return edge.source === nodeId ? edge.target : edge.source;
}

/**
 * Drogi dostępu zaznaczonego węzła:
 * - osoba → jej dostępy, repozytoria docelowe i członkostwo w zespole (jeśli graf je ma),
 * - repozytorium → wszystkie osoby z dostępem i ich krawędzie do tego repo,
 * - zespół → członkowie, ich dostępy i repozytoria.
 *
 * `null`, gdy nic nie jest zaznaczone albo zaznaczony węzeł nie należy do widocznego grafu
 * (np. odfiltrowany) — widok nie wygasza wtedy niczego.
 */
export function highlightOf(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedId: string | null,
): GraphHighlight | null {
  const selected: GraphNode | undefined = nodes.find(
    (node: GraphNode): boolean => node.id === selectedId,
  );

  if (selected === undefined) {
    return null;
  }

  const highlight: GraphHighlight = emptyHighlight();
  highlight.nodeIds.add(selected.id);

  if (selected.type === 'user') {
    leasesOf(edges, selected.id).forEach((edge: GraphEdge): void => addEdge(highlight, edge));
    membersOf(edges, selected.id).forEach((edge: GraphEdge): void => addEdge(highlight, edge));
  } else if (selected.type === 'repo') {
    edges
      .filter(
        (edge: GraphEdge): boolean => edge.data.kind === 'lease' && edge.target === selected.id,
      )
      .forEach((edge: GraphEdge): void => addEdge(highlight, edge));
  } else {
    membersOf(edges, selected.id).forEach((member: GraphEdge): void => {
      addEdge(highlight, member);
      leasesOf(edges, otherEnd(member, selected.id)).forEach((edge: GraphEdge): void =>
        addEdge(highlight, edge),
      );
    });
  }

  return highlight;
}

/** Lekkie podświetlenie przy hoverze: węzeł i jego bezpośredni sąsiedzi. */
export function neighboursOf(edges: GraphEdge[], nodeId: string): GraphHighlight {
  const highlight: GraphHighlight = emptyHighlight();
  highlight.nodeIds.add(nodeId);
  edges
    .filter((edge: GraphEdge): boolean => touches(edge, nodeId))
    .forEach((edge: GraphEdge): void => addEdge(highlight, edge));

  return highlight;
}

function compareRows(left: AccessRow, right: AccessRow): number {
  return (
    rank(STATUS_SEVERITY, left.status) - rank(STATUS_SEVERITY, right.status) ||
    rank(RECOMMENDATION_SEVERITY, left.recommendation) -
      rank(RECOMMENDATION_SEVERITY, right.recommendation) ||
    left.label.localeCompare(right.label, 'pl')
  );
}

function rowOf(nodes: GraphNode[], edge: GraphEdge, nodeId: string): AccessRow {
  const id: string = otherEnd(edge, nodeId);

  return {
    id,
    label: nodes.find((node: GraphNode): boolean => node.id === id)?.data.label ?? id,
    role: edge.data.role,
    status: edge.data.status,
    recommendation: edge.data.recommendation,
  };
}

/** Członek zespołu: najgorszy status z jego dostępów, bez roli i rekomendacji. */
function memberRowOf(
  nodes: GraphNode[],
  edges: GraphEdge[],
  member: GraphEdge,
  teamId: string,
): AccessRow {
  const row: AccessRow = rowOf(nodes, member, teamId);
  const status: LeaseStatus | null = leasesOf(edges, row.id).reduce(
    (worst: LeaseStatus | null, edge: GraphEdge): LeaseStatus | null =>
      worseStatus(worst, edge.data.status),
    null,
  );

  return { ...row, status };
}

/** Wiersze panelu szczegółów zaznaczonego węzła, od najwyższego ryzyka (status, potem rekomendacja). */
export function accessRowsOf(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedId: string,
): AccessRow[] {
  const selected: GraphNode | undefined = nodes.find(
    (node: GraphNode): boolean => node.id === selectedId,
  );

  if (selected === undefined) {
    return [];
  }

  if (selected.type === 'team') {
    return membersOf(edges, selected.id)
      .map((member: GraphEdge): AccessRow => memberRowOf(nodes, edges, member, selected.id))
      .toSorted(compareRows);
  }

  return edges
    .filter((edge: GraphEdge): boolean => edge.data.kind === 'lease' && touches(edge, selected.id))
    .map((edge: GraphEdge): AccessRow => rowOf(nodes, edge, selected.id))
    .toSorted(compareRows);
}

/** Parametr URL zaznaczenia — po etykiecie, bo `id` węzła różni się między fixtures a trybem live. */
export function selectionParamsOf(nodes: GraphNode[], selectedId: string | null): SelectionParams {
  const selected: GraphNode | undefined = nodes.find(
    (node: GraphNode): boolean => node.id === selectedId,
  );

  return selected === undefined ? {} : { [selected.type]: selected.data.label };
}

/** Odtwarza zaznaczenie z URL; nieznana etykieta to brak zaznaczenia, nie błąd. */
export function nodeFromParams(nodes: GraphNode[], params: URLSearchParams): string | null {
  for (const type of PARAM_ORDER) {
    const label: string | null = params.get(type);
    const match: GraphNode | undefined = nodes.find(
      (node: GraphNode): boolean => node.type === type && node.data.label === label,
    );

    if (match !== undefined) {
      return match.id;
    }
  }

  return null;
}
