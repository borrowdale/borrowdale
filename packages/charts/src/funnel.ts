// Lays out a funnel chart. Stages run along the chart, top to bottom or left to right, and spread
// across it: each display works in those two directions, and `point` turns them into x and y.
import type { Point, Shape } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, GAP, type Rect } from './frame.js';
import type { CheckedFunnelChart } from './funnel-series.js';
import { shareTitle, valueLabel } from './named-values.js';
import { hatched, type Paint } from './palette.js';
import { unhandled } from './statistics/types.js';
import type { ChartNode } from './types.js';

type Funnel = CheckedFunnelChart['series'][number];
/** Where a stage starts and ends along the chart. */
interface Edges {
  from: number;
  to: number;
}
/** A stage's extent: its edges, and `half` either side of the middle at each end. */
interface Stage extends Edges {
  half: [number, number];
}
/** What a stage draws, and where its label goes: undefined for a stage with nothing to draw. */
type DrawStage<S> = (stage: S, paint: (shape: Shape) => ChartNode) => { node: ChartNode; center: Point } | undefined;

/** The share of its foot a funnel area keeps of its top, as Plotly's `baseratio` does. */
const FOOT = 1 / 3;

/** `paintOf` gives each stage name its legend entry's paint. */
export function layoutFunnel(drawing: Drawing, chart: CheckedFunnelChart, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  assertRoom(rect, chart.width, chart.height);
  const [first, second] = chart.series as [Funnel, Funnel | undefined];
  const horizontal = first.orientation === 'horizontal';
  // Funnels back to back are named at their start: above them, or to their left when horizontal.
  const named = second ? nameHalves(drawing, [first, second], rect, horizontal) : 0;
  assertRoom(horizontal ? { ...rect, left: rect.left + named } : { ...rect, top: rect.top + named }, chart.width, chart.height);
  const start = (horizontal ? rect.left : rect.top) + named;
  const length = (horizontal ? rect.right - rect.left : rect.bottom - rect.top) - named;
  const breadth = horizontal ? rect.bottom - rect.top : rect.right - rect.left;
  const middle = horizontal ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2;
  const point = ([along, across]: Point): Point => (horizontal ? [start + along, across] : [across, start + along]);
  // A funnel back to back with another is named in its stages' tooltips.
  const draw = (entry: Funnel, stages: readonly Stage[], side: -1 | 0 | 1) =>
    drawStages(drawing, entry, stages, rect, paintOf, side === 0 ? '' : `${entry.name}, `, trapezoid(entry, side, middle, point));
  switch (first.display) {
    case 'funnel': {
      // Back to back, each funnel is a half, its widths on one scale with the other's.
      const funnels = second ? [first, second] : [first];
      const sides = second ? ([-1, 1] as const) : ([0] as const);
      const largest = Math.max(...funnels.flatMap((entry) => entry.data.map((item) => item.value)));
      funnels.forEach((entry, i) => draw(entry, funnelStages(entry, length, breadth / 2, largest), sides[i]!));
      return;
    }
    case 'pyramid':
      // From the apex, the area above depth y grows with y squared.
      draw(first, cumulative(first, length, (share) => Math.sqrt(share), (along) => (breadth / 2) * (along / length)), 0);
      return;
    case 'funnelArea': {
      // A trapezoid FOOT times as wide at its foot: the area above depth y is a quadratic in y.
      const narrowing = 1 - FOOT;
      const depth = (share: number) => (1 - Math.sqrt(1 - (1 - FOOT * FOOT) * share)) / narrowing;
      draw(first, cumulative(first, length, depth, (along) => (breadth / 2) * (1 - (narrowing * along) / length)), 0);
      return;
    }
    case 'pictorialStacked':
      drawSilhouette(drawing, first, rect, paintOf);
      return;
    default:
      unhandled(first.display);
  }
}

/**
 * Writes each of two funnels' names over its half, the first's before the middle, and returns the room
 * the names take at the start of the stages.
 */
function nameHalves(drawing: Drawing, pair: readonly [Funnel, Funnel], rect: Rect, horizontal: boolean): number {
  const [width, height] = [rect.right - rect.left, rect.bottom - rect.top];
  const room = horizontal ? Math.min(width / 3, Math.max(...pair.map((entry) => drawing.width(entry.name)))) : drawing.lineHeight();
  pair.forEach((entry, i) => {
    const side = i === 0 ? -1 : 1;
    const name = drawing.fit(entry.name, horizontal ? room : width / 2, `${entry.path}.name`);
    drawing.push(horizontal
      ? drawing.text(name, { x: rect.left + room, y: (rect.top + rect.bottom) / 2 + (side * height) / 4, anchor: 'end', baseline: 'middle' })
      : drawing.text(name, { x: (rect.left + rect.right) / 2 + (side * width) / 4, y: rect.top + room / 2, anchor: 'middle', baseline: 'middle' }));
  });
  return room + GAP;
}

/** Stages of equal depth, each `half` its value's share of `largest` either side of the middle. */
function funnelStages(entry: Funnel, length: number, half: number, largest: number): Stage[] {
  const depth = length / entry.data.length;
  const halves = entry.data.map((item) => (half * item.value) / largest);
  return entry.data.map((_, i) => {
    const top = halves[i]!;
    const bottom = entry.shape === 'bar' ? top : (halves[i + 1] ?? top);
    return { from: i * depth, to: (i + 1) * depth, half: [top, bottom] };
  });
}

/**
 * The stages' edges, filling `length` in turn: `depth` turns the share of the total above an edge into
 * the edge's share of the length.
 */
function edges(entry: Funnel, length: number, depth: (share: number) => number): Edges[] {
  const total = entry.data.reduce((sum, item) => sum + item.value, 0);
  let above = 0;
  return entry.data.map((item) => {
    const from = length * depth(above / total);
    above += item.value;
    return { from, to: length * depth(Math.min(1, above / total)) };
  });
}

/** Stages between those edges, `halfAt` giving the half width at a position along the chart. */
function cumulative(entry: Funnel, length: number, depth: (share: number) => number, halfAt: (along: number) => number): Stage[] {
  return edges(entry, length, depth).map(({ from, to }) => ({ from, to, half: [halfAt(from), halfAt(to)] }));
}

/**
 * Each stage as a mark: what `draw` makes of it, with its label, and its share of the total in its
 * tooltip after `prefix`. A stage with no depth has nothing to draw.
 */
function drawStages<S extends Edges>(
  drawing: Drawing, entry: Funnel, stages: readonly S[], rect: Rect, paintOf: ReadonlyMap<string, Paint>, prefix: string,
  draw: DrawStage<S>,
): void {
  const total = entry.data.reduce((sum, item) => sum + item.value, 0);
  stages.forEach((stage, i) => {
    const item = entry.data[i]!;
    const paint = (shape: Shape) => drawing.shape(shape, hatched(paintOf.get(item.name)!), [entry.name, item.name, 'stage'], entry.style);
    const drawn = stage.to > stage.from ? draw(stage, paint) : undefined;
    if (!drawn) return;
    const nodes = [drawn.node];
    if (entry.dataLabels) {
      nodes.push(drawing.label(valueLabel(item), drawn.center[0], drawn.center[1], rect, `${entry.path}.dataLabels`));
    }
    drawing.mark(shareTitle(item, total, prefix), nodes);
  });
}

/**
 * A stage as a trapezoid, or with curved sides for a smooth funnel, `side` of the middle (both sides
 * for 0). A stage with no width has nothing to draw.
 */
function trapezoid(entry: Funnel, side: -1 | 0 | 1, middle: number, point: (position: Point) => Point): DrawStage<Stage> {
  // The outer edge at each end, and the inner one: the middle for a half, the far edge otherwise.
  const outer = (h: number) => middle + (side === 0 ? h : side * h);
  const inner = (h: number) => (side === 0 ? middle - h : middle);
  return ({ from, to, half: [top, bottom] }, paint) => {
    if (!(Math.max(top, bottom) > 0)) return undefined;
    const shape: Shape = entry.shape === 'smooth'
      ? smooth(from, to, [inner(top), outer(top)], [inner(bottom), outer(bottom)], point)
      : { kind: 'polygon', points: [point([from, inner(top)]), point([from, outer(top)]), point([to, outer(bottom)]), point([to, inner(bottom)])] };
    return { node: paint(shape), center: point([(from + to) / 2, (inner((top + bottom) / 2) + outer((top + bottom) / 2)) / 2]) };
  };
}

/** A stage whose sides curve from their width at `from` to their width at `to`, level at both ends. */
function smooth(from: number, to: number, [a0, b0]: [number, number], [a1, b1]: [number, number], point: (position: Point) => Point): Shape {
  const mid = (from + to) / 2;
  const xy = (along: number, across: number) => point([along, across]).join(' ');
  return {
    kind: 'path',
    d: `M${xy(from, a0)} L${xy(from, b0)} C${xy(mid, b0)} ${xy(mid, b1)} ${xy(to, b1)} L${xy(to, a1)} C${xy(mid, a1)} ${xy(mid, a0)} ${xy(from, a0)} Z`,
  };
}

/**
 * The silhouette fitted into the chart, drawn once per stage and cut to the stage's band of it: each
 * band as deep as its share of the total.
 */
function drawSilhouette(drawing: Drawing, entry: Funnel, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  const fitted = drawing.fitPath(entry.silhouette!, rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  const { box } = fitted;
  const horizontal = entry.orientation === 'horizontal';
  const length = horizontal ? box.width : box.height;
  drawStages(drawing, entry, edges(entry, length, (share) => share), rect, paintOf, '', ({ from, to }, paint) => {
    const band = horizontal
      ? { x: box.x + from, y: box.y, width: to - from, height: box.height }
      : { x: box.x, y: box.y + from, width: box.width, height: to - from };
    return {
      node: drawing.clip(band.x, band.y, band.width, band.height, [paint({ kind: 'path', d: fitted.d })]),
      center: [band.x + band.width / 2, band.y + band.height / 2],
    };
  });
}
