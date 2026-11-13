// A hierarchy: a tree of named values, drawn as a treemap, a sunburst, an icicle or packed circles.
import { checkSweep, MAX_CORNER_RADIUS, MAX_HOLE, MAX_NAME } from './check-axis.js';
import { boolean, color, fail, fields, list, MAX_VALUE, number, oneOf, text, unique, type Fields } from './read.js';
import { readDisplay, type Choices } from './statistics/types.js';
import type { SeriesBase } from './types.js';
import type { CheckedChartBase, SeriesOf } from './validate.js';

/** The most levels below the root. */
const MAX_DEPTH = 10;
/** The most nodes in a tree, the root included. */
const MAX_NODES = 2000;
/** The most room, in units, between nodes. */
const MAX_PADDING = 50;
/**
 * The least the values may add up to: below it, a layout dividing the plot by the total overflows
 * doubles. Values far from 1 are laid out with d3's absolute tolerances, so scaling them nearer to 1
 * draws them more truly.
 */
const MIN_TOTAL = 1e-300;
/** The room between nodes when the spec gives none. */
const DEFAULT_PADDING = 2;

/** How a treemap splits each parent among its children. */
const TILES = ['squarify', 'binary', 'dice', 'slice', 'sliceDice'] as const;
export type TreemapTile = (typeof TILES)[number];
/** How a treemap shows the parents of its leaves. */
const PARENTS = ['hidden', 'nested', 'cascaded'] as const;
export type TreemapParents = (typeof PARENTS)[number];
/** The way an icicle's levels run from the root: a flame graph runs `up`. */
const DIRECTIONS = ['down', 'up', 'right', 'left'] as const;
export type IcicleDirection = (typeof DIRECTIONS)[number];

interface HierarchyOptions {
  /**
   * How a treemap splits each parent among its children: `squarify` (the default) keeps them near
   * square; `binary` halves them by value again and again; `dice` lays them side by side, `slice`
   * stacks them, and `sliceDice` alternates the two by level.
   */
  tile?: TreemapTile | undefined;
  /**
   * How a treemap shows the parents of its leaves: `hidden` (the default) draws the leaves only;
   * `nested` draws each parent too, its name in a strip along its top; `cascaded` draws them so, with
   * their children set in from the left, as stacked cards.
   */
  parents?: TreemapParents | undefined;
  /** The room between nodes, in units: 0 to 50. Defaults to 2. */
  padding?: number | undefined;
  /** In degrees clockwise from the top. Defaults to 0. */
  startAngle?: number | undefined;
  /** In degrees clockwise from the top, after `startAngle`. Defaults to 360; a semicircle runs -90 to 90. */
  endAngle?: number | undefined;
  /** The empty middle, as a share of the radius: 0 to 0.95. Defaults to 0. */
  innerRadius?: number | undefined;
  /** Rounds each segment's corners by this many units, where there is room: 0 to 1,000. Defaults to 0. */
  cornerRadius?: number | undefined;
  /** The way an icicle's levels run from the root: `down` (the default), `up` (a flame graph), `right` or `left`. */
  direction?: IcicleDirection | undefined;
  /** Orders each node's children largest first, a tie in the given order. Defaults to true; false keeps the given order. */
  sort?: boolean | undefined;
  /** Writes each node's value after its name, where the name fits inside it. */
  dataLabels?: boolean | undefined;
}

/** The options each display takes. */
export const HIERARCHY_DISPLAYS = {
  treemap: ['tile', 'parents', 'padding', 'sort', 'dataLabels'],
  sunburst: ['startAngle', 'endAngle', 'innerRadius', 'cornerRadius', 'sort', 'dataLabels'],
  icicle: ['direction', 'padding', 'sort', 'dataLabels'],
  pack: ['padding', 'sort', 'dataLabels'],
} as const satisfies Record<string, readonly (keyof HierarchyOptions)[]>;

export type HierarchyDisplay = keyof typeof HIERARCHY_DISPLAYS;

interface NodeBase {
  /** At most 100 characters, unique among its siblings. */
  name: string;
  /** The colour of this node and every node below it. The root takes none: it is not drawn. */
  color?: string | undefined;
}

/**
 * A node of a hierarchy: a leaf with a `value` from 0 to 1e15, or a parent with `children`, 1 or
 * more, whose value is the sum of theirs. At most 10 levels below the root, and 2,000 nodes in all.
 */
export type HierarchyNode =
  | (NodeBase & { value: number; children?: undefined })
  | (NodeBase & { children: readonly HierarchyNode[]; value?: undefined });

/**
 * A tree of named values, `data` its root. `display` picks the drawing: a `treemap` of nested
 * rectangles, a `sunburst` of rings, an `icicle` of bands (a flame graph runs `up`), or circles
 * packed in circles (`pack`). Each leaf's area, or its length across its band, is in proportion to
 * its value. The root is not drawn: each branch below it takes the next palette colour, and the
 * legend lists them.
 */
export type HierarchySeries = SeriesBase & { type: 'hierarchy'; data: HierarchyNode } & Choices<
    'display',
    HierarchyOptions,
    typeof HIERARCHY_DISPLAYS
  >;

/** A node as read: its value, the sum of its leaves' for a parent, and where it is in the spec. */
export interface CheckedNode {
  name: string;
  value: number;
  color: string | undefined;
  children: CheckedNode[];
  path: string;
}

export interface CheckedHierarchyChart extends CheckedChartBase {
  system: 'hierarchy';
  series: SeriesOf<'hierarchy'>[];
}

export function readHierarchy(r: Fields, path: string, reserve: (count: number) => void) {
  const display = readDisplay(r, HIERARCHY_DISPLAYS);
  let nodes = 1;
  reserve(1);
  // Each list of children is counted and reserved before it is read, so a tree is never read past
  // its limits.
  const count = (at: string) => (length: number) => {
    nodes += length;
    if (nodes > MAX_NODES) fail(at, `brings the tree to at least ${nodes} nodes, more than the ${MAX_NODES} a hierarchy draws`);
    reserve(length);
  };
  const node = (at: string, raw: unknown, depth: number): CheckedNode => {
    const item = fields(at, raw);
    item.allow(['name', 'value', 'color', 'children']);
    const name = item.required('name', text(MAX_NAME));
    if (depth === 0 && item.has('color')) fail(`${at}.color`, 'must be left out: the root is not drawn; give each branch below it a color');
    if (depth === 0 && !item.has('children')) fail(`${at}.children`, 'is missing: the root is not drawn, so a tree of one node draws nothing');
    const own = item.optional('color', color);
    if (!item.has('children')) {
      return { name, value: item.required('value', number(0, MAX_VALUE)), color: own, children: [], path: at };
    }
    if (item.has('value')) fail(`${at}.value`, 'must be left out: a node with children takes the sum of their values');
    if (depth >= MAX_DEPTH) fail(`${at}.children`, `would be level ${depth + 1} below the root, deeper than the ${MAX_DEPTH} levels a hierarchy draws`);
    const children = item.required('children', list(1, MAX_NODES, (childAt, child) => node(childAt, child, depth + 1), count(`${at}.children`)));
    unique(children.map((child) => child.name), (i) => `${at}.children[${i}].name`);
    return { name, value: children.reduce((sum, child) => sum + child.value, 0), color: own, children, path: at };
  };
  const root = r.required('data', (at, raw) => node(at, raw, 0));
  if (!(root.value > 0)) fail(`${path}.data`, 'has no value above 0, so there is nothing to draw');
  if (root.value < MIN_TOTAL) fail(`${path}.data`, `has values adding up to ${root.value}, too little to draw: they must add up to at least ${MIN_TOTAL}`);
  const parents = r.optional('parents', oneOf(PARENTS)) ?? 'hidden';
  const sweep = display === 'sunburst' ? checkSweep(r, path) : { startAngle: 0, endAngle: 360 };
  return {
    display,
    root,
    tile: r.optional('tile', oneOf(TILES)) ?? 'squarify',
    parents,
    padding: r.optional('padding', number(0, MAX_PADDING)) ?? DEFAULT_PADDING,
    ...sweep,
    innerRadius: r.optional('innerRadius', number(0, MAX_HOLE)) ?? 0,
    cornerRadius: r.optional('cornerRadius', number(0, MAX_CORNER_RADIUS)) ?? 0,
    direction: r.optional('direction', oneOf(DIRECTIONS)) ?? 'down',
    sort: r.optional('sort', boolean) ?? true,
  };
}

export function checkHierarchyChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'hierarchy'>[]): CheckedHierarchyChart {
  if (r.has('axes')) fail('axes', 'must be left out: a hierarchy has no axes');
  if (series.length > 1) fail('series', `of a hierarchy must be one hierarchy series, got ${series.length}`);
  return { ...base, system: 'hierarchy', series };
}
