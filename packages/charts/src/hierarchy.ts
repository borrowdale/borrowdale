// Lays out a hierarchy: the tree placed by its display's layout and scaled to the chart. Each node
// below the root is drawn as a rectangle, a ring segment or a circle in its branch's paint, with its
// path and value as its tooltip, except a parent in a treemap that is not nested. Its name is written
// inside it where it fits, except in a packed parent, where it would lie over the children.
import type { Shape } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, rectangle, type Rect } from './frame.js';
import { fitSweep, onCircle, RADIANS, sliceShape } from './geometry.js';
import { binary, dice, pack, partition, placed, slice, sliceDice, squarify, treemap, type LaidOut, type Tiling } from './hierarchy-geometry.js';
import type { CheckedHierarchyChart, CheckedNode, IcicleDirection, TreemapTile } from './hierarchy-series.js';
import { valueLabel } from './named-values.js';
import { hatched, paints, type Paint } from './palette.js';
import { unhandled } from './statistics/types.js';
import type { ChartNode } from './types.js';

type Hierarchy = CheckedHierarchyChart['series'][number];
type LaidNode = LaidOut<CheckedNode>;

const TILINGS = { squarify, binary, dice, slice, sliceDice } as const satisfies Record<TreemapTile, Tiling>;
/** How far a cascaded treemap sets each parent's children in from its left edge, in units. */
const CASCADE = 6;
/** The room kept between a label and the edges of its mark, in units. */
const INSET = 2;
/** What separates the names in a node's tooltip. */
const PATH_SEPARATOR = ' › ';
/**
 * How far every other level turns its hatching, in degrees. The palette's angles, -41, -11, 49 and 79,
 * lie 30 and 90 degrees apart, so a turn of 45 never lands on one: a parent and its child never hatch
 * alike, and no node below a branch hatches like another branch's legend entry, unless a node's own
 * colour repeats a palette colour, which is the spec's choice.
 */
const LEVEL_TURN = 45;

/** `paintOf` gives each branch below the root its legend entry's paint. */
export function layoutHierarchy(drawing: Drawing, chart: CheckedHierarchyChart, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  assertRoom(rect, chart.width, chart.height);
  const series = chart.series[0]!;
  const root = placed(series.root, series.sort);
  const draw = drawerOf(drawing, series, rect, root);
  // Each node takes its own colour, else its parent's paint; a branch below the root starts from its
  // legend entry's. The hatching turns LEVEL_TURN degrees on every other level.
  const visit = (node: LaidNode, inherited: Paint, above: string): void => {
    const base = node.item.color === undefined ? inherited : paints([{ color: node.item.color, path: node.item.path }])[0]!;
    const path = above === '' ? node.item.name : `${above}${PATH_SEPARATOR}${node.item.name}`;
    const drawn = node.value > 0 ? draw(node) : undefined;
    if (drawn !== undefined) {
      const paint = { color: base.color, hachureAngle: base.hachureAngle + (node.depth % 2 === 0 ? LEVEL_TURN : 0) };
      // A node too small to draw keeps its tooltip, so every value above 0 is still named.
      const style = drawn.filled ? hatched(paint) : { stroke: paint.color, fill: 'none' };
      const nodes: ChartNode[] = drawn.shape === undefined ? [] : [drawing.shape(drawn.shape, style, [series.name, node.item.path], series.style)];
      const name = series.dataLabels ? valueLabel(node.item) : node.item.name;
      const text = drawn.label && drawing.inside(name, drawn.label.box, drawn.label.start);
      if (text) nodes.push(text);
      drawing.mark(valueLabel({ name: path, value: node.value }), nodes);
    }
    for (const child of node.children) visit(child, base, path);
  };
  for (const branch of root.children) visit(branch, paintOf.get(branch.item.name)!, '');
}

/** What a node is drawn as (nothing when it has no size), whether it is filled, and the box its name may go in. */
interface Drawn {
  shape: Shape | undefined;
  filled: boolean;
  label: { box: Rect; start: boolean } | undefined;
}

/**
 * Places the tree, and says how each node is drawn: nothing for a parent of a plain treemap, which
 * draws its leaves only.
 */
function drawerOf(drawing: Drawing, series: Hierarchy, rect: Rect, root: LaidNode): (node: LaidNode) => Drawn | undefined {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  switch (series.display) {
    case 'treemap': {
      // A nested parent's strip is a line of text tall with INSET above and below it, so its name,
      // inset only at its sides, always has room for a line.
      const header = drawing.lineHeight() + 2 * INSET;
      const { padding, parents } = series;
      const [nested, cascade] = [parents !== 'hidden', parents === 'cascaded'];
      treemap(root, TILINGS[series.tile], width, height, {
        inner: padding,
        top: nested ? header : padding,
        left: cascade ? CASCADE : padding,
        right: cascade ? 0 : padding,
        bottom: cascade ? 0 : padding,
      });
      return (node) => {
        const box = within(moved({ left: node.x0, top: node.y0, right: node.x1, bottom: node.y1 }, rect), rect);
        if (node.children.length === 0) return { shape: rectangle(box), filled: true, label: { box: inset(box), start: false } };
        if (!nested) return undefined;
        const strip = { left: box.left + INSET, top: box.top, right: box.right - INSET, bottom: Math.min(box.bottom, box.top + header) };
        return { shape: rectangle(box), filled: false, label: { box: strip, start: true } };
      };
    }
    case 'icicle': {
      const across = series.direction === 'down' || series.direction === 'up';
      partition(root, across ? width : height, across ? height : width, series.padding);
      return (node) => {
        const box = within(icicleBox(node, series.direction, rect), rect);
        return { shape: rectangle(box), filled: true, label: { box: inset(box), start: false } };
      };
    }
    case 'sunburst': {
      partition(root, 1, 1, 0);
      const { startAngle, endAngle, innerRadius, cornerRadius } = series;
      const { center, radius } = fitSweep(rect, startAngle, endAngle, innerRadius);
      const hole = radius * innerRadius;
      const sweep = endAngle - startAngle;
      // A label is a line of text, with INSET above and below it.
      const line = drawing.lineHeight() + 2 * INSET;
      return (node) => {
        const [from, to] = [startAngle + node.x0 * sweep, startAngle + node.x1 * sweep];
        const [inner, outer] = [hole + (radius - hole) * node.y0, hole + (radius - hole) * node.y1];
        if (!(to > from && outer > inner)) return { shape: undefined, filled: true, label: undefined };
        // The name goes level across the middle of its segment, in the widest line its depth and its
        // length there allow at the segment's angle. Rounded corners are cut where the edges are their
        // radius from them, as `sliceShape` cuts them, so the line keeps that far inside the rims.
        const [near, far] = rounded(inner, outer, to - from, cornerRadius);
        const middle = (near + far) / 2;
        const [dx, dy] = onCircle((from + to) / 2);
        const [x, y] = [center[0] + middle * dx, center[1] + middle * dy];
        const half = levelWidth(near, far, from, to, line) / 2 - INSET;
        const box = { left: x - half, top: y - line / 2, right: x + half, bottom: y + line / 2 };
        return { shape: sliceShape(center, outer, inner, from, to, cornerRadius), filled: true, label: { box, start: false } };
      };
    }
    case 'pack': {
      pack(root, width, height, series.padding);
      return (node) => {
        const [x, y, r] = [rect.left + node.x, rect.top + node.y, node.r];
        const leaf = node.children.length === 0;
        if (!(r > 0)) return { shape: undefined, filled: leaf, label: undefined };
        // A leaf's name goes in the square inside its circle; a parent's would lie over its children.
        const label = leaf ? { box: square(x, y, r / Math.SQRT2), start: false } : undefined;
        return { shape: { kind: 'circle', cx: x, cy: y, diameter: 2 * r }, filled: leaf, label };
      };
    }
    default:
      return unhandled(series.display);
  }
}

/** An icicle node's rectangle: its band and its span across it, turned to its direction. */
function icicleBox(node: LaidNode, direction: IcicleDirection, rect: Rect): Rect {
  switch (direction) {
    case 'down':
      return { left: rect.left + node.x0, right: rect.left + node.x1, top: rect.top + node.y0, bottom: rect.top + node.y1 };
    case 'up':
      return { left: rect.left + node.x0, right: rect.left + node.x1, top: rect.bottom - node.y1, bottom: rect.bottom - node.y0 };
    case 'right':
      return { left: rect.left + node.y0, right: rect.left + node.y1, top: rect.top + node.x0, bottom: rect.top + node.x1 };
    case 'left':
      return { left: rect.right - node.y1, right: rect.right - node.y0, top: rect.top + node.x0, bottom: rect.top + node.x1 };
    default:
      return unhandled(direction);
  }
}

/**
 * `box` kept inside `rect`. Padding can leave a node no width or height, and d3 then puts it in the
 * middle of its share, which for a branch below the root can lie up to half the padding outside the
 * plot. The node is drawn there as a line, inside the plot.
 */
function within({ left, top, right, bottom }: Rect, rect: Rect): Rect {
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  return {
    left: clamp(left, rect.left, rect.right),
    top: clamp(top, rect.top, rect.bottom),
    right: clamp(right, rect.left, rect.right),
    bottom: clamp(bottom, rect.top, rect.bottom),
  };
}

/**
 * A segment's rims, `inner` and `outer`, moved in by the radius its corners are rounded by: the same
 * share of `corner` that `sliceShape` takes, at most half the depth and the length of half the rim.
 * A pie's tip, at the centre, stays sharp.
 */
function rounded(inner: number, outer: number, sweep: number, corner: number): [number, number] {
  const half = (sweep * RADIANS) / 2;
  const cut = (rim: number) => Math.min(corner, (outer - inner) / 2, rim * half);
  return [inner === 0 ? 0 : inner + cut(inner), outer - cut(outer)];
}

/** How many times `levelWidth` halves its search. */
const HALVINGS = 40;

/**
 * The widest level line `height` tall, centred on the middle of a segment from `inner` to `outer`
 * between the directions `from` and `to` (degrees): one whose corners lie inside the outer circle and
 * between the segment's edges. The disc is convex, and so is a wedge up to a half turn. The line is
 * centred on the middle radius, so each of its points mirrors one no farther than `outer`, and so
 * lies at least twice the middle radius less `outer`, which is `inner`, from the centre: it clears the
 * hole. That also keeps it on its middle's side of the centre, so a wedge wider than a half turn,
 * whose gap lies on the other side, never decides it.
 */
function levelWidth(inner: number, outer: number, from: number, to: number, height: number): number {
  const middle = (inner + outer) / 2;
  const [mx, my] = onCircle((from + to) / 2).map((v) => v * middle) as [number, number];
  const [ax, ay] = onCircle(from);
  const [bx, by] = onCircle(to);
  const fits = (width: number): boolean => {
    const [left, right, top, bottom] = [mx - width / 2, mx + width / 2, my - height / 2, my + height / 2];
    const corners = [[left, top], [right, top], [left, bottom], [right, bottom]] as const;
    // Past the first edge and short of the second.
    const between = (x: number, y: number) => to - from > 180 || (ax * y - ay * x >= 0 && x * by - y * bx >= 0);
    return corners.every(([x, y]) => x * x + y * y <= outer * outer && between(x, y));
  };
  if (!fits(0)) return 0;
  let [low, high] = [0, 2 * outer];
  for (let i = 0; i < HALVINGS; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

/** `box`, given from the plot's origin, moved into `rect`. */
function moved({ left, top, right, bottom }: Rect, rect: Rect): Rect {
  return { left: rect.left + left, top: rect.top + top, right: rect.left + right, bottom: rect.top + bottom };
}

/** `box` shrunk by INSET on every side. */
function inset({ left, top, right, bottom }: Rect): Rect {
  return { left: left + INSET, top: top + INSET, right: right - INSET, bottom: bottom - INSET };
}

/** The square around (x, y) reaching `half` each way, less INSET. */
function square(x: number, y: number, half: number): Rect {
  return inset({ left: x - half, top: y - half, right: x + half, bottom: y + half });
}
