// Lays out a hierarchy drawn as nodes joined by links: a tree running in one of four directions, a
// radial tree, an indented list or a word tree. The links go down first, each in its child's branch
// colour; then each node, the root in ink, with its path and value as its tooltip, and its name
// beside it, in its box, or as its word, where the name fits without crossing another or leaving the
// plot.
import type { Point, Shape } from '@borrowdale/core';
import type { TextAnchor, TextBaseline } from '@borrowdale/text';
import { coordinate } from './curves.js';
import type { Drawing } from './drawing.js';
import { GAP, rectangle, type Rect } from './frame.js';
import { alignTowards, fitSweep, polarFrame } from './geometry.js';
import type { CheckedHierarchyChart, CheckedTreeNode, HierarchyDirection, NodeLinkDisplay, TreeLayout, TreeLinks, TreeNodeShape } from './hierarchy-series.js';
import { branches, eachBefore } from './hierarchy-walk.js';
import { boxAt, LabelRoom } from './label-room.js';
import { POINT_SIZE, solid } from './marks.js';
import { valueLabel } from './named-values.js';
import { INK, type Paint } from './palette.js';
import { unhandled } from './statistics/types.js';
import { cluster, placedTree, radialSeparation, separation, tidy, type PlacedNode, type Separation } from './tree-geometry.js';
import type { ChartNode } from './types.js';

export type TreeSeries = Extract<CheckedHierarchyChart['series'][number], { display: NodeLinkDisplay }>;
type PlacedTreeNode = PlacedNode<CheckedTreeNode>;

/** The room kept between a name and the edges of its box, in units. */
const INSET = 2;
/** How far a name is written from its node's centre: past the dot, and a little more. */
const OFFSET = POINT_SIZE / 2 + INSET;
/** The most of the plot a tree keeps for the names beyond its leaves, or before its root. */
const MOST_ROOM = 1 / 4;
/** How far each level of an indented tree is set in, at most, in units. */
const INDENT = 14;
/** How many times the chart's font size a word tree writes its largest value at. */
const WORD_SCALE = 2;
/** The most room a word tree leaves between its columns for the links, in units. */
const WORD_SPACE = 80;
/** The most degrees a radial elbow's arc turns between the points it is drawn through. */
const ARC_STEP = 5;
/** The layout of each `layout`. */
const LAYOUTS = { tidy, cluster } as const satisfies Record<TreeLayout, (root: PlacedTreeNode, separate: Separation, across: number, along: number) => void>;
/** The view of a tree of each `shape`. */
const TREE_VIEWS = { dot: dotTreeView, box: boxTreeView } as const satisfies Record<TreeNodeShape, (context: Context) => View>;

/** Where a view writes a node's name, and how it is anchored there. */
interface Spot {
  x: number;
  y: number;
  anchor: TextAnchor;
  baseline: TextBaseline;
  /** How wide it may be: it is cut short to fit. */
  room: number;
  fontSize?: number | undefined;
  /** How tall it may be: it is left out where a line is taller. */
  height?: number | undefined;
}

/** How a display draws each node, the link to it from its parent, and where its name goes. */
interface View {
  /** The node's mark: a dot, a box, or nothing, where its word is the mark. */
  mark: (node: PlacedTreeNode) => { shape: Shape; filled: boolean } | undefined;
  link: (parent: PlacedTreeNode, node: PlacedTreeNode) => Shape;
  /** Where the node's name may go: the first of several places where it is written whole or cut short. */
  spot: (node: PlacedTreeNode) => Spot | readonly Spot[];
}

/** What each view is made from. */
interface Context {
  drawing: Drawing;
  series: TreeSeries;
  rect: Rect;
  root: PlacedTreeNode;
  /** Every node, each before its children. */
  nodes: readonly PlacedTreeNode[];
  /** A node's name, with its value after it for `dataLabels` where it has one. */
  name: (node: PlacedTreeNode) => string;
}

/**
 * Where a tree lies on the chart, by points in its own frame: across its levels, and along them from
 * the root, as the layouts place its nodes.
 */
interface Frame {
  project: (across: number, along: number) => Point;
  /** The points a line across the levels at `along`, from `from` to `to`, is drawn through. */
  run: (from: number, to: number, along: number) => Point[];
}

/** `paintOf` gives each branch below the root its legend entry's paint. */
export function layoutTree(drawing: Drawing, series: TreeSeries, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  const root = placedTree(series.root, series.sort);
  const nodes: PlacedTreeNode[] = [];
  eachBefore(root, (node) => nodes.push(node));
  const name = ({ item: { name, value } }: PlacedTreeNode) => (series.dataLabels && value !== undefined ? valueLabel({ name, value }) : name);
  const view = viewOf({ drawing, series, rect, root, nodes, name });
  const below = branches(root, paintOf);
  for (const { node, paint } of below) {
    drawing.push(drawing.outline(view.link(node.parent!, node), { stroke: paint.color }, [series.name, node.item.path, 'link'], series.style));
  }
  // The root is drawn in ink, apart from its branches.
  const drawn = [{ node: root, color: INK, path: root.item.name }, ...below.map(({ node, paint, path }) => ({ node, color: paint.color, path }))];
  const room = new LabelRoom(drawing.lineHeight());
  for (const { node, color, path } of drawn) {
    const marks: ChartNode[] = [];
    const mark = view.mark(node);
    if (mark !== undefined) {
      const key = [series.name, node.item.path];
      marks.push(mark.filled ? drawing.shape(mark.shape, solid(color), key, series.style) : drawing.outline(mark.shape, { stroke: color }, key, series.style));
    }
    const written = [view.spot(node)].flat().reduce<ChartNode | undefined>((found, spot) => found ?? writeName(drawing, name(node), spot, rect, room), undefined);
    if (written !== undefined) marks.push(written);
    drawing.mark(node.item.value === undefined ? path : valueLabel({ name: path, value: node.item.value }), marks);
  }
}

/**
 * `text` written at `spot`, cut short to its room, and its box kept in `room`: nothing where no
 * character fits, where a line is taller than the spot allows, or where it would cross a name
 * written before it or leave the plot.
 */
function writeName(drawing: Drawing, text: string, spot: Spot, plot: Rect, room: LabelRoom): ChartNode | undefined {
  const fitted = drawing.fittedName(text, spot.room, spot.fontSize);
  if (fitted === undefined) return undefined;
  const options = { anchor: spot.anchor, baseline: spot.baseline, fontSize: spot.fontSize };
  const extent = drawing.extent(fitted, options);
  if (spot.height !== undefined && extent.up + extent.down > spot.height) return undefined;
  const box = boxAt(extent, spot.x, spot.y);
  const inPlot = box.left >= plot.left && box.right <= plot.right && box.top >= plot.top && box.bottom <= plot.bottom;
  if (!inPlot || !room.clear(box)) return undefined;
  room.add(box);
  return drawing.textMark(fitted, { ...options, x: spot.x, y: spot.y });
}

function viewOf(context: Context): View {
  const { display } = context.series;
  switch (display) {
    case 'tree':
      return TREE_VIEWS[context.series.shape](context);
    case 'radialTree':
      return radialView(context);
    case 'indentedTree':
      return indentedView(context);
    case 'wordTree':
      return wordView(context);
    default:
      return unhandled(display);
  }
}

/**
 * Lays the tree out by its `layout`, `across` wide and `along` deep: each node's `y` from its depth,
 * or with `distance: 'length'` from its summed length, the farthest node's at `along`.
 */
function spread(series: TreeSeries, root: PlacedTreeNode, separate: Separation, across: number, along: number): void {
  LAYOUTS[series.layout](root, separate, across, along);
  switch (series.distance) {
    case 'depth':
      return;
    case 'length': {
      // The reader reads a length for every node below the root of a tree spaced by length.
      const from = new Map<PlacedTreeNode, number>([[root, 0]]);
      eachBefore(root, (node) => {
        if (node.parent) from.set(node, from.get(node.parent)! + node.item.length!);
      });
      const farthest = Math.max(...from.values());
      eachBefore(root, (node) => {
        node.y = (from.get(node)! / farthest) * along;
      });
      return;
    }
    default:
      return unhandled(series.distance);
  }
}

/** How wide the widest of `texts` is written at the chart's font size. */
function widest(drawing: Drawing, texts: readonly string[]): number {
  return Math.max(0, ...texts.map((text) => drawing.width(text)));
}

function isLeaf(node: PlacedTreeNode): boolean {
  return node.children.length === 0;
}

/** How far a tree running `direction` reaches across its levels and along them; `horizontal` when the levels run across the chart. */
function treeAxes(direction: HierarchyDirection, rect: Rect): { horizontal: boolean; across: number; along: number } {
  const horizontal = direction === 'right' || direction === 'left';
  const [width, height] = [rect.right - rect.left, rect.bottom - rect.top];
  return { horizontal, across: horizontal ? height : width, along: horizontal ? width : height };
}

/** The frame of a tree running `direction`, its root `start` in from the plot's edge. Lines across the levels are straight. */
function towardFrame(direction: HierarchyDirection, rect: Rect, start: number): Frame {
  const project = (across: number, along: number) => toward(direction, rect, across, start + along);
  return { project, run: (from, to, along) => [project(from, along), project(to, along)] };
}

/** The point `along` the levels from the root and `across` them, for a tree running `direction`. */
function toward(direction: HierarchyDirection, rect: Rect, across: number, along: number): Point {
  switch (direction) {
    case 'right':
      return [rect.left + along, rect.top + across];
    case 'left':
      return [rect.right - along, rect.top + across];
    case 'down':
      return [rect.left + across, rect.top + along];
    case 'up':
      return [rect.left + across, rect.bottom - along];
    default:
      return unhandled(direction);
  }
}

/** The frame of a tree laid straight onto the chart, its levels running right: along is x, across is y. */
const RIGHTWARD: Frame = { project: (across, along) => [along, across], run: (from, to, along) => [[along, from], [along, to]] };

/**
 * A tree running `direction`, a dot at each node. A leaf's name goes beyond it and a parent's before
 * it, the leaves' and the root's in room kept at each end, at most MOST_ROOM of the plot.
 */
function dotTreeView({ drawing, series, rect, root, nodes, name }: Context): View {
  const { direction, links } = series;
  const { horizontal, across, along } = treeAxes(direction, rect);
  const forward = direction === 'right' || direction === 'down' ? 1 : -1;
  const line = drawing.lineHeight();
  const room = (named: readonly PlacedTreeNode[]) => Math.min(along * MOST_ROOM, OFFSET + INSET + (horizontal ? widest(drawing, named.map(name)) : line));
  const start = room([root]);
  spread(series, root, separation, across, along - start - room(nodes.filter(isLeaf)));
  const frame = towardFrame(direction, rect, start);
  const at = (node: PlacedTreeNode) => frame.project(node.x, node.y);
  const rooms = acrossRoom(rowsOf(nodes), across);
  return {
    mark: (node) => dot(at(node)),
    link: (parent, node) => linkShape(links, frame, [parent.x, parent.y], [node.x, node.y], 'parent'),
    spot: (node) => {
      const [x, y] = at(node);
      // A leaf's name goes beyond it, away from the root. A parent's sits just off the line through it,
      // on the side away from the link that arrives from its own parent, so clear of its links: before
      // it, towards the root, on a horizontal tree, and on the root's side of it on a vertical one,
      // whose links leave it sideways.
      const leaf = isLeaf(node);
      // Where the node's parent lies across the levels: -1 before it (above it on a horizontal tree, to
      // its left on a vertical one), 1 after it, 0 level with it or none.
      const side = node.parent === undefined ? 0 : Math.sign(node.parent.x - node.x);
      // The other side of the line is clear too only where the link to the node arrives along that
      // line: an elbow, or from a parent level with it, or none to the root. There a name the away side
      // has no room for may go there instead.
      const sides = (away: Spot, other: Spot): Spot[] => (side === 0 || links === 'elbow' ? [away, other] : [away]);
      if (!horizontal) {
        const { before, after, centred } = rooms.get(node)!;
        if (leaf) return { x, y: y + forward * OFFSET, anchor: 'middle', baseline: forward > 0 ? 'top' : 'bottom', room: centred - INSET };
        const baseline = forward > 0 ? 'bottom' : 'top';
        const left: Spot = { x: x - OFFSET, y: y - forward * INSET, anchor: 'end', baseline, room: before - OFFSET - INSET };
        const right: Spot = { x: x + OFFSET, y: y - forward * INSET, anchor: 'start', baseline, room: after - OFFSET - INSET };
        // The name runs to the right, unless its parent lies there.
        return side > 0 ? sides(left, right) : sides(right, left);
      }
      if (leaf) {
        const from = x + forward * OFFSET;
        return { x: from, y, anchor: forward > 0 ? 'start' : 'end', baseline: 'middle', room: forward > 0 ? rect.right - from : from - rect.left };
      }
      // The root's name runs to the edge of the plot; another parent's stops short of its parent.
      const from = x - forward * OFFSET;
      const room = node.parent === undefined ? (forward > 0 ? from - rect.left : rect.right - from) : Math.abs(x - at(node.parent)[0]) - 2 * OFFSET;
      const anchor = forward > 0 ? 'end' : 'start';
      const above: Spot = { x: from, y: y - INSET, anchor, baseline: 'bottom', room };
      const below: Spot = { x: from, y: y + INSET, anchor, baseline: 'top', room };
      // Below the line where the parent lies above it, else above it.
      return side < 0 ? sides(below, above) : sides(above, below);
    },
  };
}

/**
 * A tree running `direction`, each node's name in a box, as an organisation chart draws them. The
 * boxes of a level are one size: as deep as the levels and as wide as the narrowest gap between
 * neighbours there allow, less a GAP, no larger than the level's widest name needs and no smaller than
 * a dot. A link ends at a box's edge and turns halfway between the levels, as an organisation chart's
 * lines do.
 */
function boxTreeView({ drawing, series, rect, root, nodes, name }: Context): View {
  const { direction, links } = series;
  const { horizontal, across, along } = treeAxes(direction, rect);
  const line = lineOf(drawing);
  // Half a level at each end, for the first and the last boxes.
  const half = along / (2 * (Math.max(...nodes.map((node) => node.depth)) + 1));
  spread(series, root, separation, across, along - half - half);
  const frame = towardFrame(direction, rect, half);
  const rows = rowsOf(nodes);
  const rooms = acrossRoom(rows, across);
  // Inside its INSET, a box is its level's widest name wide and a line tall, where the levels and
  // the neighbours leave room: `room` and `tall` are what its name is fitted to.
  const boxes = new Map<PlacedTreeNode, { width: number; height: number; room: number; tall: number }>();
  for (const row of rows) {
    const [deep, wide] = [2 * half - GAP - 2 * INSET, Math.min(...row.map((node) => rooms.get(node)!.centred)) - GAP - 2 * INSET];
    const named = widest(drawing, row.map(name));
    const [room, tall] = horizontal ? [Math.min(deep, named), Math.min(wide, line)] : [Math.min(wide, named), Math.min(deep, line)];
    const box = { width: Math.max(POINT_SIZE, room + 2 * INSET), height: Math.max(POINT_SIZE, tall + 2 * INSET), room, tall };
    for (const node of row) boxes.set(node, box);
  }
  // Half a box's depth along the levels, where a link to it ends.
  const reach = (node: PlacedTreeNode) => (horizontal ? boxes.get(node)!.width : boxes.get(node)!.height) / 2;
  return {
    mark: (node) => {
      const [x, y] = frame.project(node.x, node.y);
      const { width, height } = boxes.get(node)!;
      return { shape: rectangle({ left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 }), filled: false };
    },
    link: (parent, node) => linkShape(links, frame, [parent.x, parent.y + reach(parent)], [node.x, node.y - reach(node)], 'middle'),
    spot: (node) => {
      const [x, y] = frame.project(node.x, node.y);
      const { room, tall } = boxes.get(node)!;
      return { x, y, anchor: 'middle', baseline: 'middle', room, height: tall };
    },
  };
}

/** How tall a line of text is, as `writeName` measures a name: rounded as text layout rounds it. */
function lineOf(drawing: Drawing): number {
  const { up, down } = drawing.extent('', { anchor: 'middle', baseline: 'middle' });
  return up + down;
}

/** A dot at `point`. */
function dot([cx, cy]: Point): { shape: Shape; filled: boolean } {
  return { shape: { kind: 'circle', cx, cy, diameter: POINT_SIZE }, filled: true };
}

/** The nodes as far from the root as each other, each row in order across the levels. */
function rowsOf(nodes: readonly PlacedTreeNode[]): PlacedTreeNode[][] {
  const rows = new Map<number, PlacedTreeNode[]>();
  for (const node of nodes) {
    const row = rows.get(node.y);
    if (row === undefined) rows.set(node.y, [node]);
    else row.push(node);
  }
  return [...rows.values()].map((row) => row.sort((a, b) => a.x - b.x));
}

/**
 * Each node's room across the levels within its row: to its nearest neighbour on each side, else to
 * the plot's edge, `across` wide; and `centred`, the room a name or a box centred on it may take: the
 * narrower side's, twice the distance where that side is the plot's edge.
 */
function acrossRoom(rows: readonly PlacedTreeNode[][], across: number): Map<PlacedTreeNode, { before: number; after: number; centred: number }> {
  const room = new Map<PlacedTreeNode, { before: number; after: number; centred: number }>();
  for (const row of rows) {
    row.forEach((node, i) => {
      const [first, last] = [i === 0, i === row.length - 1];
      const before = first ? node.x : node.x - row[i - 1]!.x;
      const after = last ? across - node.x : row[i + 1]!.x - node.x;
      room.set(node, { before, after, centred: Math.min(first ? 2 * before : before, last ? 2 * after : after) });
    });
  }
  return room;
}

/**
 * A link between two points of `frame`'s tree, `from` the parent's end and `to` the child's, each
 * [across, along]. An elbow turns at the parent, so the bend never lies over a parent's name, or with
 * `middle` halfway between the levels; a curve leaves and arrives along the levels, as d3's links do.
 */
function linkShape(links: TreeLinks, { project, run }: Frame, [fromAcross, fromAlong]: Point, [toAcross, toAlong]: Point, turn: 'parent' | 'middle'): Shape {
  const [from, to] = [project(fromAcross, fromAlong), project(toAcross, toAlong)];
  const middle = (fromAlong + toAlong) / 2;
  switch (links) {
    case 'straight':
      return { kind: 'line', x1: from[0], y1: from[1], x2: to[0], y2: to[1] };
    case 'elbow':
      return { kind: 'linearPath', points: turn === 'parent' ? [...run(fromAcross, toAcross, fromAlong), to] : [from, ...run(fromAcross, toAcross, middle), to] };
    case 'curved': {
      const xy = ([x, y]: Point) => `${coordinate(x)} ${coordinate(y)}`;
      return { kind: 'path', d: `M${xy(from)} C${xy(project(fromAcross, middle))} ${xy(project(toAcross, middle))} ${xy(to)}` };
    }
    default:
      return unhandled(links);
  }
}

/**
 * A tree around the centre of the largest part of a circle from `startAngle` to `endAngle` that fits
 * the plot, its root at the centre and each level a ring, so a line across the levels is an arc. A
 * leaf's name goes beyond it, in room kept at the rim, a parent's before it, and the root's below it.
 */
function radialView({ drawing, series, rect, root, nodes, name }: Context): View {
  const { startAngle, endAngle, links } = series;
  const { center, radius } = fitSweep(rect, startAngle, endAngle, 0);
  // Room at the rim for the leaves' names: as wide as the widest, or a line tall for one at the top or
  // the bottom, at most MOST_ROOM of the radius.
  const kept = Math.min(radius * MOST_ROOM - OFFSET, Math.max(widest(drawing, nodes.filter(isLeaf).map(name)), lineOf(drawing)));
  const rim = radius - OFFSET - kept;
  spread(series, root, radialSeparation, 1, rim);
  const { point } = polarFrame(center, radius, 0);
  const angle = (across: number) => startAngle + across * (endAngle - startAngle);
  const frame: Frame = {
    project: (across, along) => point(angle(across), along),
    // An arc, drawn through points at most ARC_STEP degrees apart.
    run: (from, to, along) => {
      const [first, last] = [angle(from), angle(to)];
      const steps = Math.max(1, Math.ceil(Math.abs(last - first) / ARC_STEP));
      return Array.from({ length: steps + 1 }, (_, i) => point(first + ((last - first) * i) / steps, along));
    },
  };
  return {
    mark: (node) => dot(frame.project(node.x, node.y)),
    link: (parent, node) => linkShape(links, frame, [parent.x, parent.y], [node.x, node.y], 'parent'),
    spot: (node) => {
      // The root's name goes below the centre, else to its left or right or above it, where a part of a
      // circle leaves the centre on the plot's edge, else off a corner of it, where the centre is a
      // corner of the plot.
      if (node.parent === undefined) {
        const [cx, cy] = center;
        return [
          { x: cx, y: cy + OFFSET, anchor: 'middle', baseline: 'top', room: rim },
          { x: cx - OFFSET, y: cy, anchor: 'end', baseline: 'middle', room: rim },
          { x: cx + OFFSET, y: cy, anchor: 'start', baseline: 'middle', room: rim },
          { x: cx, y: cy - OFFSET, anchor: 'middle', baseline: 'bottom', room: rim },
          { x: cx + OFFSET, y: cy - OFFSET, anchor: 'start', baseline: 'bottom', room: rim },
          { x: cx - OFFSET, y: cy - OFFSET, anchor: 'end', baseline: 'bottom', room: rim },
          { x: cx + OFFSET, y: cy + OFFSET, anchor: 'start', baseline: 'top', room: rim },
          { x: cx - OFFSET, y: cy + OFFSET, anchor: 'end', baseline: 'top', room: rim },
        ];
      }
      const leaf = isLeaf(node);
      const degrees = angle(node.x);
      const [x, y] = point(degrees, node.y + (leaf ? OFFSET : -OFFSET));
      const room = leaf ? Math.max(kept, radius - node.y - OFFSET) : node.y - node.parent.y - 2 * OFFSET;
      return { x, y, ...alignTowards(degrees, leaf), room };
    },
  };
}

/**
 * An indented list: a row for each node, the root's at the top and each node's below its parent's,
 * set in by its depth and joined to its parent by an elbow, its name after it. Rows shorter than a
 * line of text leave every name out.
 */
function indentedView({ rect, nodes }: Context): View {
  const row = (rect.bottom - rect.top) / nodes.length;
  const levels = Math.max(...nodes.map((node) => node.depth));
  const indent = Math.min(INDENT, (rect.right - rect.left - POINT_SIZE) / (levels + 1));
  const rows = new Map(nodes.map((node, i) => [node, i]));
  // A row thinner than a dot sets the first and last dots in, so they keep inside the plot.
  const [top, bottom] = [rect.top + POINT_SIZE / 2, rect.bottom - POINT_SIZE / 2];
  const at = (node: PlacedTreeNode): Point => [rect.left + POINT_SIZE / 2 + node.depth * indent, Math.min(bottom, Math.max(top, rect.top + (rows.get(node)! + 0.5) * row))];
  return {
    mark: (node) => dot(at(node)),
    link: (parent, node) => {
      const [[px, py], [x, y]] = [at(parent), at(node)];
      return linkShape('elbow', RIGHTWARD, [py, px], [y, x], 'parent');
    },
    spot: (node) => {
      const [x, y] = at(node);
      return { x: x + OFFSET, y, anchor: 'start', baseline: 'middle', room: rect.right - x - OFFSET, height: row };
    },
  };
}

/**
 * A word tree: each node its word, at the chart's font size for a value of 0 or a missing one, rising
 * to WORD_SCALE times it for the largest value. Each level is a column as wide as its widest word, and
 * a curve joins the end of each word to the start of each word after it.
 */
function wordView({ drawing, rect, root, nodes, name }: Context): View {
  const largest = Math.max(0, ...nodes.map((node) => node.item.value ?? 0));
  const base = drawing.fontSize;
  const sizeOf = ({ value }: CheckedTreeNode) => (value === undefined || largest === 0 ? base : base * (1 + ((WORD_SCALE - 1) * value) / largest));
  const sizes = new Map(nodes.map((node) => [node, sizeOf(node.item)]));
  const widths = new Map(nodes.map((node) => [node, drawing.width(name(node), sizes.get(node))]));
  // Each column is as wide as its widest word, and the room left over goes between the columns, for
  // the links: at least 2 GAPs and at most WORD_SPACE.
  const columns: number[] = [];
  for (const node of nodes) columns[node.depth] = Math.max(columns[node.depth] ?? 0, widths.get(node)!);
  const [total, gaps] = [columns.reduce((sum, width) => sum + width, 0), columns.length - 1];
  const fit = Math.min(1, (rect.right - rect.left) / (total + gaps * 2 * GAP));
  const between = fit < 1 ? 2 * GAP * fit : Math.min(WORD_SPACE, Math.max(2 * GAP, (rect.right - rect.left - total) / gaps));
  const caps = columns.map((width) => width * fit);
  const starts = [rect.left];
  for (let i = 1; i < caps.length; i++) starts.push(starts[i - 1]! + caps[i - 1]! + between);
  // A link leaves its word GAP / 2 from it, or less where shrunk columns leave less room between them.
  const pad = Math.min(GAP / 2, between / 4);
  tidy(root, separation, rect.bottom - rect.top, 0);
  const at = (node: PlacedTreeNode): Point => [starts[node.depth]!, rect.top + node.x];
  return {
    mark: () => undefined,
    link: (parent, node) => {
      const [[px, py], [x, y]] = [at(parent), at(node)];
      return linkShape('curved', RIGHTWARD, [py, px + Math.min(widths.get(parent)!, caps[parent.depth]!) + pad], [y, x - pad], 'middle');
    },
    spot: (node) => {
      const [x, y] = at(node);
      return { x, y, anchor: 'start', baseline: 'middle', room: caps[node.depth]!, fontSize: sizes.get(node) };
    },
  };
}
