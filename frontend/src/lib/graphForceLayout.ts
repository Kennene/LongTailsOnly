import type { XYPosition } from '@xyflow/react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

import type { GraphEdge, GraphNode } from '@/types/api';

/** Lewy górny róg każdego węzła (tak pozycjonuje React Flow), po `id` węzła. */
export type LayoutPositions = Record<string, XYPosition>;

/**
 * Promień okręgu węzła w px. Zespół jest hubem pajęczyny, osoba średnia, repozytorium najmniejsze —
 * typ rozróżnia rozmiar i kolor, a status niesie obrys. Ten sam promień czyta `GraphCircleNode`
 * (średnica) i `FloatingEdge` (przycięcie krawędzi do brzegu okręgu).
 */
export const GRAPH_NODE_RADIUS: Record<GraphNode['type'], number> = {
  team: 60,
  user: 44,
  repo: 40,
};

/** Kolejność startowa: spirala d3 kładzie pierwsze indeksy w środku, więc zespoły lądują w centrum. */
const TYPE_ORDER: readonly GraphNode['type'][] = ['team', 'user', 'repo'];

/**
 * Długość krawędzi między środkami okręgów: członkostwo trzyma osobę przy zespole, a dostęp jest
 * dłuższa, bo na odcinku między brzegami okręgów musi się zmieścić etykieta roli.
 */
const LINK_DISTANCE: Record<GraphEdge['data']['kind'], number> = {
  membership: 140,
  lease: 190,
};

/**
 * Odpychanie: bazowe wg typu plus składnik za każdą krawędź. Osoba z wieloma dostępami (np. 10)
 * rozpycha otoczenie, więc jej repozytoria dostają wolne miejsce, a obce węzły nie wchodzą pod jej
 * krawędzie. Wartości (z `LINK_DISTANCE` i siłą `PULL`) wybrane pomiarem na danych demo: przegląd
 * 54 wariantów pod kątem krawędzi przechodzących przez obce węzły (20 → 3) i powiększenia `fitView`.
 */
const CHARGE: Record<GraphNode['type'], number> = {
  team: -700,
  user: -300,
  repo: -250,
};
const CHARGE_PER_LINK = -200;

/** Słabe przyciąganie do środka: osoby bez dostępów i repo bez dostępów nie odpływają z kadru. */
const PULL = 0.02;

/** Odstęp między brzegami okręgów — etykiety siedzą w środku, więc wystarcza wąski margines. */
const COLLIDE_MARGIN = 16;

/** Tyle ticków potrzebuje domyślny `alphaDecay` d3, żeby `alpha` spadła poniżej `alphaMin`. */
const TICKS = 300;

/** Stałe ziarno: ten sam graf daje ten sam układ przy każdym odświeżeniu. */
const SEED = 20261003;

type LayoutNode = SimulationNodeDatum & { id: string; type: GraphNode['type'] };
type LayoutLink = SimulationLinkDatum<LayoutNode> & { kind: GraphEdge['data']['kind'] };

/**
 * Cache po tożsamości tablic z odpowiedzi API: przerenderowanie (hover, zaznaczenie, filtr) nie
 * uruchamia symulacji ponownie. Dwa poziomy, bo TanStack Query przy refetchu zachowuje referencję
 * niezmienionych `nodes`, a `edges` mogą się zmienić (np. odebrany dostęp).
 */
const CACHE = new WeakMap<GraphNode[], WeakMap<GraphEdge[], LayoutPositions>>();

/**
 * Generator mulberry32 — seedowany zamiennik `Math.random` dla `randomSource` d3 (d3 losuje
 * drobne „jiggle” przy pokrywających się węzłach; z `Math.random` układ różniłby się co odświeżenie).
 */
function mulberry32(seed: number): () => number {
  let state: number = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed: number = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function compareIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

/** Stała kolejność niezależna od kolejności z API: typ (zespół → osoba → repo), potem `id`. */
function compareNodes(left: GraphNode, right: GraphNode): number {
  return (
    TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type) || compareIds(left.id, right.id)
  );
}

/** Koniec krawędzi przed startem symulacji to jeszcze `id` węzła (d3 podmienia go później). */
function edgeEnd(end: LayoutLink['source']): string {
  return typeof end === 'object' ? end.id : String(end);
}

function simulate(nodes: GraphNode[], edges: GraphEdge[]): LayoutPositions {
  const layoutNodes: LayoutNode[] = nodes
    .toSorted(compareNodes)
    .map((node: GraphNode): LayoutNode => ({ id: node.id, type: node.type }));
  const known = new Set<string>(layoutNodes.map((node: LayoutNode): string => node.id));
  const links: LayoutLink[] = edges
    .filter((edge: GraphEdge): boolean => known.has(edge.source) && known.has(edge.target))
    .toSorted((left: GraphEdge, right: GraphEdge): number => compareIds(left.id, right.id))
    .map((edge: GraphEdge): LayoutLink => ({
      source: edge.source,
      target: edge.target,
      kind: edge.data.kind,
    }));

  // Stopień węzła liczymy z krawędzi kontraktu, zanim `forceLink` podmieni końce na obiekty.
  const degree = new Map<string, number>();
  links.forEach((link: LayoutLink): void => {
    [edgeEnd(link.source), edgeEnd(link.target)].forEach((id: string): void => {
      degree.set(id, (degree.get(id) ?? 0) + 1);
    });
  });

  forceSimulation<LayoutNode>()
    .randomSource(mulberry32(SEED))
    .nodes(layoutNodes)
    .force(
      'link',
      forceLink<LayoutNode, LayoutLink>(links)
        .id((node: LayoutNode): string => node.id)
        .distance((link: LayoutLink): number => LINK_DISTANCE[link.kind]),
    )
    .force(
      'charge',
      forceManyBody<LayoutNode>()
        .strength(
          (node: LayoutNode): number =>
            CHARGE[node.type] + CHARGE_PER_LINK * (degree.get(node.id) ?? 0),
        )
        .distanceMax(700),
    )
    .force('center', forceCenter(0, 0))
    .force('x', forceX<LayoutNode>(0).strength(PULL))
    .force('y', forceY<LayoutNode>(0).strength(PULL))
    .force(
      'collide',
      forceCollide<LayoutNode>()
        .radius((node: LayoutNode): number => GRAPH_NODE_RADIUS[node.type] + COLLIDE_MARGIN)
        .iterations(2),
    )
    .stop()
    .tick(TICKS);

  return Object.fromEntries(
    layoutNodes.map((node: LayoutNode): [string, XYPosition] => {
      const radius: number = GRAPH_NODE_RADIUS[node.type];

      return [node.id, { x: (node.x ?? 0) - radius, y: (node.y ?? 0) - radius }];
    }),
  );
}

/**
 * Deterministyczny układ pajęczyny (d3-force) dla widoku `/graph`.
 *
 * Symulacja biegnie synchronicznie `TICKS` razy i staje — bez ciągłej animacji i bez drgania.
 * Siły: `link` (długość wg rodzaju krawędzi), `charge` (odpychanie wg typu węzła), `center`,
 * słabe `x`/`y` oraz `collide` (promień okręgu + margines). Repozytoria współdzielone przez wiele
 * osób są ciągnięte przez kilka krawędzi naraz, więc same „wciągają się” między te osoby.
 *
 * `position` z API (układ kolumnowy backendu) jest ignorowane. Układ liczymy na **pełnym** grafie,
 * żeby filtry nie przesuwały węzłów.
 */
export function computeForceLayout(nodes: GraphNode[], edges: GraphEdge[]): LayoutPositions {
  const byEdges: WeakMap<GraphEdge[], LayoutPositions> =
    CACHE.get(nodes) ?? new WeakMap<GraphEdge[], LayoutPositions>();
  const cached: LayoutPositions | undefined = byEdges.get(edges);

  if (cached !== undefined) {
    return cached;
  }

  const positions: LayoutPositions = simulate(nodes, edges);
  byEdges.set(edges, positions);
  CACHE.set(nodes, byEdges);

  return positions;
}

/**
 * Największe rozciągnięcie jednej osi: bardzo szeroki panel nie spłaszcza pajęczyny w linię,
 * w której krawędzie biegną prawie poziomo i zlewają się ze sobą.
 */
const MAX_STRETCH = 2.5;

/** Kroki bisekcji współczynnika — przy 2⁻³⁰ szerokości przedziału błąd proporcji jest pomijalny. */
const FIT_STEPS = 30;

type Circle = { id: string; radius: number; x: number; y: number };

function circlesOf(nodes: GraphNode[], positions: LayoutPositions): Circle[] {
  return nodes
    .filter((node: GraphNode): boolean => positions[node.id] !== undefined)
    .map((node: GraphNode): Circle => {
      const radius: number = GRAPH_NODE_RADIUS[node.type];

      return {
        id: node.id,
        radius,
        x: positions[node.id].x + radius,
        y: positions[node.id].y + radius,
      };
    });
}

/** Rozpiętość okręgów wzdłuż osi, gdy współrzędne środków tej osi mnożymy przez `factor`. */
function extentOf(circles: Circle[], axis: 'x' | 'y', factor: number): number {
  const starts: number[] = circles.map(
    (circle: Circle): number => factor * circle[axis] - circle.radius,
  );
  const ends: number[] = circles.map(
    (circle: Circle): number => factor * circle[axis] + circle.radius,
  );

  return Math.max(...ends) - Math.min(...starts);
}

/**
 * Rozciąga układ wzdłuż **jednej** osi tak, żeby prostokąt obejmujący okręgi miał proporcje
 * panelu (`aspect` = szerokość / wysokość). Pajęczyna z d3 wychodzi mniej więcej kwadratowa,
 * a panel jest szeroki — bez tego `fitView` dopasowuje graf do wysokości i zostawia puste boki.
 *
 * Mnożymy wyłącznie przez współczynnik ≥ 1, więc węzły tylko się od siebie oddalają: brak
 * nakładania z symulacji zostaje zachowany. Współczynnik szukamy bisekcją, bo rozpiętość zależy
 * też od promieni skrajnych okręgów. `aspect = null` (panel jeszcze niezmierzony) nic nie zmienia.
 */
export function fitLayoutToAspect(
  nodes: GraphNode[],
  positions: LayoutPositions,
  aspect: number | null,
): LayoutPositions {
  const circles: Circle[] = circlesOf(nodes, positions);

  if (aspect === null || circles.length === 0) {
    return aspect === null ? positions : {};
  }

  const current: number = extentOf(circles, 'x', 1) / extentOf(circles, 'y', 1);
  const axis: 'x' | 'y' = aspect > current ? 'x' : 'y';
  const target: number =
    axis === 'x' ? aspect * extentOf(circles, 'y', 1) : extentOf(circles, 'x', 1) / aspect;
  let low = 1;
  let high: number = MAX_STRETCH;

  for (let step = 0; step < FIT_STEPS; step += 1) {
    const middle: number = (low + high) / 2;

    if (extentOf(circles, axis, middle) < target) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return Object.fromEntries(
    circles.map((circle: Circle): [string, XYPosition] => {
      const x: number = axis === 'x' ? low * circle.x : circle.x;
      const y: number = axis === 'y' ? low * circle.y : circle.y;

      return [circle.id, { x: x - circle.radius, y: y - circle.radius }];
    }),
  );
}
