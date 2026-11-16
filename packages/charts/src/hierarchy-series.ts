// A hierarchy: a tree of named values, drawn as a treemap, a sunburst, an icicle or packed circles,
// which fill the plot by value, or as nodes joined by links: a tree, a radial tree, an indented list
// or a word tree.
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
/**
 * The least the largest value of a packed tree may be. Packing works to d3's fixed slack of 1e-9 in a
 * radius, the square root of a value, so radii of at least 1e-6 keep that slack a thousandth of them.
 */
const MIN_PACKED = 1e-12;
/** The room between nodes when the spec gives none. */
const DEFAULT_PADDING = 2;

/** How a treemap splits each parent among its children. */
const TILES = ['squarify', 'binary', 'dice', 'slice', 'sliceDice'] as const;
export type TreemapTile = (typeof TILES)[number];
/** How a treemap shows the parents of its leaves. */
const PARENTS = ['hidden', 'nested', 'cascaded'] as const;
export type TreemapParents = (typeof PARENTS)[number];
/** The way an icicle's or a tree's levels run from the root: a flame graph runs `up`. */
const DIRECTIONS = ['down', 'up', 'right', 'left'] as const;
export type HierarchyDirection = (typeof DIRECTIONS)[number];
/** How a tree spaces its nodes: `tidy` keeps each level on a line, `cluster` puts every leaf on the last. */
const LAYOUTS = ['tidy', 'cluster'] as const;
export type TreeLayout = (typeof LAYOUTS)[number];
/** How a tree joins a parent to each child. */
const LINKS = ['straight', 'elbow', 'curved'] as const;
export type TreeLinks = (typeof LINKS)[number];
/** What a tree draws at each node. */
const NODE_SHAPES = ['dot', 'box'] as const;
export type TreeNodeShape = (typeof NODE_SHAPES)[number];
/** What a tree's levels are spaced by: each node's depth below the root, or its summed `length`. */
const DISTANCES = ['depth', 'length'] as const;
export type TreeDistance = (typeof DISTANCES)[number];

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
  /**
   * The way the levels run from the root: `down`, `up` (an icicle running up is a flame graph), `right`
   * or `left`. An icicle runs `down` by default, a tree `right`.
   */
  direction?: HierarchyDirection | undefined;
  /** `tidy` (the default) keeps each level on a line; `cluster`, a dendrogram, puts every leaf on the last. */
  layout?: TreeLayout | undefined;
  /** How a parent is joined to each child: `straight`, `elbow` (at right angles) or `curved` (the default). */
  links?: TreeLinks | undefined;
  /** A `tree`'s nodes: `dot` (the default) draws a dot at each; `box` draws its name in a box, as an organisation chart does. */
  nodeShape?: TreeNodeShape | undefined;
  /**
   * `depth` (the default) spaces the levels evenly; `length` places each node its `length` beyond its
   * parent, as a phylogenetic tree places them by their branch lengths: at least one above 0, and not
   * with `nodeShape: 'box'`.
   */
  distance?: TreeDistance | undefined;
  /**
   * Orders each node's children largest first, a tie in the given order and a missing value after
   * every value. Defaults to true; false keeps the given order.
   */
  sort?: boolean | undefined;
  /** Writes each node's value after its name, where it has one and the name is written. */
  dataLabels?: boolean | undefined;
}

/** The options each display that fills the plot by value takes. */
const SPACE_FILLING_DISPLAYS = {
  treemap: ['tile', 'parents', 'padding', 'sort', 'dataLabels'],
  sunburst: ['startAngle', 'endAngle', 'innerRadius', 'cornerRadius', 'sort', 'dataLabels'],
  icicle: ['direction', 'padding', 'sort', 'dataLabels'],
  pack: ['padding', 'sort', 'dataLabels'],
} as const satisfies Record<string, readonly (keyof HierarchyOptions)[]>;

/** The options each display that draws nodes joined by links takes: its leaves may have no value. */
const NODE_LINK_DISPLAYS = {
  tree: ['direction', 'layout', 'links', 'nodeShape', 'distance', 'sort', 'dataLabels'],
  radialTree: ['startAngle', 'endAngle', 'layout', 'links', 'distance', 'sort', 'dataLabels'],
  indented: ['sort', 'dataLabels'],
  wordTree: ['sort', 'dataLabels'],
} as const satisfies Record<string, readonly (keyof HierarchyOptions)[]>;

/** The options each display takes: every display is of one family or the other. */
export const HIERARCHY_DISPLAYS = { ...SPACE_FILLING_DISPLAYS, ...NODE_LINK_DISPLAYS } as const;

export type HierarchyDisplay = keyof typeof HIERARCHY_DISPLAYS;
export type NodeLinkDisplay = keyof typeof NODE_LINK_DISPLAYS;

interface NodeBase {
  /** At most 100 characters, unique among its siblings. */
  name: string;
  /**
   * The colour of this node and every node below it. The root takes none: a display that fills the plot
   * does not draw it, and a tree draws it in ink.
   */
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
 * A node of a tree drawn as nodes and links: as a `HierarchyNode`, except that a leaf may leave out
 * its `value`, and its parent's value is then missing too. With `distance: 'length'`, every node below
 * the root gives its `length` from its parent, from 0 to 1e15.
 */
export type TreeNode =
  | (NodeBase & { value?: number | undefined; length?: number | undefined; children?: undefined })
  | (NodeBase & { children: readonly TreeNode[]; length?: number | undefined; value?: undefined });

/**
 * A tree of named values, `data` its root. `display` picks the drawing: a `treemap` of nested
 * rectangles, a `sunburst` of rings, an `icicle` of bands (a flame graph runs `up`), or circles
 * packed in circles (`pack`), each leaf's area, or its length across its band, in proportion to its
 * value, the root not drawn; or nodes joined by links from the root, as a `tree`, a `radialTree`, an
 * `indented` list or a `wordTree`. Each branch below the root takes the next palette colour, and the
 * legend lists them.
 */
export type HierarchySeries = SeriesBase & { type: 'hierarchy' } & (
    | (Choices<'display', HierarchyOptions, typeof SPACE_FILLING_DISPLAYS> & { data: HierarchyNode })
    | (Choices<'display', HierarchyOptions, typeof NODE_LINK_DISPLAYS> & { data: TreeNode })
  );

/** A node as read: its value, the sum of its leaves' for a parent, and where it is in the spec. */
export interface CheckedNode {
  name: string;
  value: number;
  color: string | undefined;
  children: CheckedNode[];
  path: string;
}

/**
 * A node of a tree drawn with links, as read: its value, missing where a leaf below it gives none,
 * and its length from its parent, read only for `distance: 'length'`.
 */
export interface CheckedTreeNode {
  name: string;
  value: number | undefined;
  length: number | undefined;
  color: string | undefined;
  children: CheckedTreeNode[];
  path: string;
}

export interface CheckedHierarchyChart extends CheckedChartBase {
  system: 'hierarchy';
  series: SeriesOf<'hierarchy'>[];
}

export function readHierarchy(r: Fields, path: string, reserve: (count: number) => void) {
  const display = readDisplay(r, HIERARCHY_DISPLAYS);
  return isNodeLink(display) ? readNodeLink(r, path, reserve, display) : readSpaceFilling(r, path, reserve, display);
}

export function isNodeLink(display: string): display is NodeLinkDisplay {
  return Object.hasOwn(NODE_LINK_DISPLAYS, display);
}

/** Whether `display` takes `distance`, and so can space its levels by length. */
function takesDistance(display: NodeLinkDisplay): boolean {
  return NODE_LINK_DISPLAYS[display].some((option) => option === 'distance');
}
/** The displays that draw lengths, as a message names them: "a tree or a radialTree". */
const SPACED_BY_LENGTH = Object.keys(NODE_LINK_DISPLAYS)
  .filter(isNodeLink)
  .filter(takesDistance)
  .map((display) => `a ${display}`)
  .join(' or ');

/** Why the root of each family takes no colour and must have children. */
interface RootRules {
  color: string;
  children: string;
}
const SPACE_FILLING_ROOT: RootRules = {
  color: 'must be left out: the root is not drawn; give each branch below it a color',
  children: 'is missing: the root is not drawn, so a tree of one node draws nothing',
};
const NODE_LINK_ROOT: RootRules = {
  color: 'must be left out: the root is drawn in ink, apart from its branches; give each branch below it a color',
  children: 'is missing: a tree of one node has no links to draw',
};

/** A tree that fills the plot by value: every leaf has a value, and they add up to more than 0. */
function readSpaceFilling(r: Fields, path: string, reserve: (count: number) => void, display: keyof typeof SPACE_FILLING_DISPLAYS) {
  const root = readTree<CheckedNode, object>(r, reserve, ['name', 'value', 'color', 'children'], SPACE_FILLING_ROOT, {
    own: () => ({}),
    leaf: (item, base) => ({ ...base, value: item.required('value', number(0, MAX_VALUE)), children: [] }),
    parent: (base, children) => {
      const value = children.reduce((sum, child) => sum + child.value, 0);
      // A layout divides each parent's box by its value, so a total of 0 draws nothing and one under
      // MIN_TOTAL would overflow.
      if (value > 0 && value < MIN_TOTAL) fail(base.path, `has values adding up to ${value}, too little to draw: they must add up to at least ${MIN_TOTAL}`);
      return { ...base, value, children };
    },
  });
  if (!(root.value > 0)) fail(`${path}.data`, 'has no value above 0, so there is nothing to draw');
  if (display === 'pack' && !(largest(root) >= MIN_PACKED)) {
    fail(`${path}.data`, `has no value of at least ${MIN_PACKED}, too small to pack: circles are packed to within 1e-9, so scale the values up`);
  }
  // Read in this order, so a spec with several mistakes is told of the same one first as before trees.
  const parents = r.optional('parents', oneOf(PARENTS)) ?? 'hidden';
  const sweep = checkSweep(r, path);
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

/** A tree drawn as nodes and links: a leaf's value may be left out, and its parent's is then missing. */
function readNodeLink(r: Fields, path: string, reserve: (count: number) => void, display: NodeLinkDisplay) {
  const distance = r.optional('distance', oneOf(DISTANCES)) ?? 'depth';
  const nodeShape = r.optional('nodeShape', oneOf(NODE_SHAPES)) ?? 'dot';
  if (nodeShape === 'box' && distance === 'length') {
    fail(`${path}.nodeShape`, "must be 'dot' with distance: 'length': boxes are spaced a level apart, so they cannot show lengths");
  }
  // A length is read where the levels are spaced by it, and refused elsewhere, where it would draw
  // nothing.
  let longest = 0;
  const length = (item: Fields, at: string, depth: number): number | undefined => {
    if (distance === 'length' && depth > 0) {
      const given = item.required('length', number(0, MAX_VALUE));
      longest = Math.max(longest, given);
      return given;
    }
    if (!item.has('length')) return undefined;
    if (depth === 0) fail(`${at}.length`, 'must be left out: the root is where lengths start from');
    if (!takesDistance(display)) fail(`${at}.length`, `must be left out: only ${SPACED_BY_LENGTH} given distance: 'length' draws lengths`);
    return fail(`${at}.length`, `must be left out, or the series given distance: 'length': with distance: '${distance}', lengths are not drawn`);
  };
  const root = readTree<CheckedTreeNode, { length: number | undefined }>(r, reserve, ['name', 'value', 'color', 'children', 'length'], NODE_LINK_ROOT, {
    own: (item, at, depth) => ({ length: length(item, at, depth) }),
    leaf: (item, base) => ({ ...base, value: item.optional('value', number(0, MAX_VALUE)), children: [] }),
    // A parent's value is missing where any child's is.
    parent: (base, children) => ({
      ...base,
      value: children.reduce<number | undefined>((sum, child) => (sum === undefined || child.value === undefined ? undefined : sum + child.value), 0),
      children,
    }),
  });
  if (distance === 'length' && !(longest > 0)) fail(`${path}.data`, 'has no length above 0, so every node would lie on the root');
  return {
    display,
    root,
    layout: r.optional('layout', oneOf(LAYOUTS)) ?? 'tidy',
    links: r.optional('links', oneOf(LINKS)) ?? 'curved',
    nodeShape,
    distance,
    direction: r.optional('direction', oneOf(DIRECTIONS)) ?? 'right',
    ...checkSweep(r, path),
    sort: r.optional('sort', boolean) ?? true,
  };
}

/** What every node read holds, whatever its family: its name and colour, and where it is in the spec. */
interface ReadNode {
  name: string;
  color: string | undefined;
  path: string;
}

/**
 * Reads `data`, a tree, its root as `rules` require. `make.own` reads what every node of the family
 * holds beyond a `ReadNode`, before its children are read; `make.leaf` and `make.parent` read the
 * rest. Each list of children is counted and reserved before it is read, so a tree is never read past
 * its limits.
 */
function readTree<N extends { name: string }, Own extends object>(
  r: Fields,
  reserve: (count: number) => void,
  keys: readonly string[],
  rules: RootRules,
  make: {
    own: (item: Fields, at: string, depth: number) => Own;
    leaf: (item: Fields, base: ReadNode & Own) => N;
    parent: (base: ReadNode & Own, children: N[]) => N;
  },
): N {
  let nodes = 1;
  reserve(1);
  const count = (at: string) => (length: number) => {
    nodes += length;
    if (nodes > MAX_NODES) fail(at, `brings the tree to at least ${nodes} nodes, more than the ${MAX_NODES} a hierarchy draws`);
    reserve(length);
  };
  const node = (at: string, raw: unknown, depth: number): N => {
    const item = fields(at, raw);
    item.allow(keys);
    const name = item.required('name', text(MAX_NAME));
    if (depth === 0 && item.has('color')) fail(`${at}.color`, rules.color);
    if (depth === 0 && !item.has('children')) fail(`${at}.children`, rules.children);
    const base = { name, color: item.optional('color', color), path: at, ...make.own(item, at, depth) };
    if (!item.has('children')) return make.leaf(item, base);
    if (item.has('value')) fail(`${at}.value`, 'must be left out: a node with children takes the sum of their values');
    if (depth >= MAX_DEPTH) fail(`${at}.children`, `would be level ${depth + 1} below the root, deeper than the ${MAX_DEPTH} levels a hierarchy draws`);
    const children = item.required('children', list(1, MAX_NODES, (childAt, child) => node(childAt, child, depth + 1), count(`${at}.children`)));
    unique(children.map((child) => child.name), (i) => `${at}.children[${i}].name`);
    return make.parent(base, children);
  };
  return r.required('data', (at, raw) => node(at, raw, 0));
}

export function checkHierarchyChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'hierarchy'>[]): CheckedHierarchyChart {
  if (r.has('axes')) fail('axes', 'must be left out: a hierarchy has no axes');
  if (series.length > 1) fail('series', `of a hierarchy must be one hierarchy series, got ${series.length}`);
  return { ...base, system: 'hierarchy', series };
}

/** The largest value of any leaf of `node`. */
function largest(node: CheckedNode): number {
  return node.children.length === 0 ? node.value : Math.max(...node.children.map(largest));
}
