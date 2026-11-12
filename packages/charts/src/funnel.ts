// Lays out a funnel chart. Stages run along the chart, top to bottom or left to right, and spread
// across it: each display works in those two directions, and `point` turns them into x and y.
import type { Point, Shape } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, GAP, type Rect } from './frame.js';
import { hatched, type Paint } from './palette.js';
import { formatNumber, formatValue, PLAIN_FORMAT } from './scale.js';
import { unhandled } from './statistics/types.js';
import type { ChartNode } from './types.js';
import type { CheckedFunnelChart } from './funnel-series.js';

type Funnel = CheckedFunnelChart['series'][number];
/** A stage's extent: from `from` to `to` along the chart, `half` either side of the middle at each end. */
interface Stage {
  from: number;
  to: number;
  half: [number, number];
}

/** The share of its foot a funnel area keeps of its top, as Plotly's `baseratio` does. */
const FOOT = 1 / 3;

/** `paintOf` gives each stage name its legend entry's paint. */
export function layoutFunnel(drawing: Drawing, chart: CheckedFunnelChart, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  assertRoom(rect, chart.width, chart.height);
  const [first, second] = chart.series as [Funnel, Funnel | undefined];
  const horizontal = first.horizontal;
  // Funnels back to back are named at their start: above them, or to their left when horizontal.
  const named = second ? nameHalves(drawing, [first, second], rect, horizontal) : 0;
  assertRoom(horizontal ? { ...rect, left: rect.left + named } : { ...rect, top: rect.top + named }, chart.width, chart.height);
  const start = (horizontal ? rect.left : rect.top) + named;
  const length = (horizontal ? rect.right - rect.left : rect.bottom - rect.top) - named;
  const breadth = horizontal ? rect.bottom - rect.top : rect.right - rect.left;
  const middle = horizontal ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2;
  const point = ([along, across]: Point): Point => (horizontal ? [start + along, across] : [across, start + along]);
  const draw = (entry: Funnel, stages: readonly Stage[], side: -1 | 0 | 1) =>
    drawStages(drawing, entry, stages, side, middle, point, rect, paintOf, chart.series.length > 1);
  if (second) {
    // Back to back: each a half, its widths on one scale with the other's.
    const largest = Math.max(...first.data.map((item) => item.value), ...second.data.map((item) => item.value));
    draw(first, funnelStages(first, length, breadth / 2, largest), -1);
    draw(second, funnelStages(second, length, breadth / 2, largest), 1);
    return;
  }
  switch (first.display) {
    case 'funnel':
      draw(first, funnelStages(first, length, breadth / 2, Math.max(...first.data.map((item) => item.value))), 0);
      return;
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
 * Stages filling `length` in turn: `depth` turns the share of the total above a stage's edge into the
 * edge's share of the length, and `halfAt` gives the half width at a position along the chart.
 */
function cumulative(entry: Funnel, length: number, depth: (share: number) => number, halfAt: (along: number) => number): Stage[] {
  const total = entry.data.reduce((sum, item) => sum + item.value, 0);
  let above = 0;
  return entry.data.map((item) => {
    const from = length * depth(above / total);
    above += item.value;
    const to = length * depth(Math.min(1, above / total));
    return { from, to, half: [halfAt(from), halfAt(to)] };
  });
}

/**
 * Each stage as a mark: its shape, `side` of the middle (both sides for 0), and its label. A stage
 * with no depth or no width has nothing to draw.
 */
function drawStages(
  drawing: Drawing, entry: Funnel, stages: readonly Stage[], side: -1 | 0 | 1, middle: number,
  point: (position: Point) => Point, rect: Rect, paintOf: ReadonlyMap<string, Paint>, pair: boolean,
): void {
  const total = entry.data.reduce((sum, item) => sum + item.value, 0);
  stages.forEach(({ from, to, half: [top, bottom] }, i) => {
    const item = entry.data[i]!;
    if (!(to > from) || !(Math.max(top, bottom) > 0)) return;
    // The outer edge at each end, and the inner one: the middle for a half, the far edge otherwise.
    const outer = (h: number) => middle + (side === 0 ? h : side * h);
    const inner = (h: number) => (side === 0 ? middle - h : middle);
    const shape: Shape = entry.display === 'funnel' && entry.shape === 'smooth'
      ? smooth(from, to, [inner(top), outer(top)], [inner(bottom), outer(bottom)], point)
      : { kind: 'polygon', points: [point([from, inner(top)]), point([from, outer(top)]), point([to, outer(bottom)]), point([to, inner(bottom)])] };
    const percent = formatNumber((item.value / total) * 100, 1, PLAIN_FORMAT);
    const nodes: ChartNode[] = [drawing.shape(shape, hatched(paintOf.get(item.name)!), [entry.name, item.name, 'stage'], entry.style)];
    if (entry.dataLabels) {
      const [x, y] = point([(from + to) / 2, (inner((top + bottom) / 2) + outer((top + bottom) / 2)) / 2]);
      nodes.push(drawing.label(`${item.name}: ${formatValue(item.value)}`, x, y, rect, `${entry.path}.dataLabels`));
    }
    drawing.mark(`${pair ? `${entry.name}, ` : ''}${item.name}: ${formatValue(item.value)} (${percent}%)`, nodes);
  });
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
  const total = entry.data.reduce((sum, item) => sum + item.value, 0);
  const length = entry.horizontal ? box.width : box.height;
  let above = 0;
  entry.data.forEach((item) => {
    const from = (length * above) / total;
    above += item.value;
    const to = (length * Math.min(total, above)) / total;
    if (!(to > from)) return;
    const band = entry.horizontal
      ? { x: box.x + from, y: box.y, width: to - from, height: box.height }
      : { x: box.x, y: box.y + from, width: box.width, height: to - from };
    const shape = drawing.shape({ kind: 'path', d: fitted.d }, hatched(paintOf.get(item.name)!), [entry.name, item.name, 'stage'], entry.style);
    const nodes: ChartNode[] = [drawing.clip(band.x, band.y, band.width, band.height, [shape])];
    if (entry.dataLabels) {
      nodes.push(drawing.label(`${item.name}: ${formatValue(item.value)}`, band.x + band.width / 2, band.y + band.height / 2, rect, `${entry.path}.dataLabels`));
    }
    const percent = formatNumber((item.value / total) * 100, 1, PLAIN_FORMAT);
    drawing.mark(`${item.name}: ${formatValue(item.value)} (${percent}%)`, nodes);
  });
}
