import { drawXYLine, drawXYArea } from './cartesian-paths.js';
import { barShape } from './bar-shape.js';
import { annotationValues, drawAnnotations } from './annotations.js';
import type { Point, Shape, SketchStyle } from '@borrowdale/core';
import {
  drawGrid,
  drawGuide,
  fitBandEnds,
  guide,
  reserveFor,
  type AxisKey,
  type Reserve,
} from './cartesian-axes.js';
import type { CheckedLinearAxis } from './check-axis.js';
import { areaPath, linePath, straightPoints } from './curves.js';
import type { Drawing, SeedKey } from './drawing.js';
import { assertRoom, BAND_PADDING, type Rect } from './frame.js';
import { loneDot, piecesOf, POINT_SIZE, runsOf, solid } from './marks.js';
import { hatched, LINE_WIDTH, type Paint } from './palette.js';
import { stackGroup, stackSpans, type Span } from './stack.js';
import { bandScale, formatValue, formatAxisValue, place, scaleOf, type BandScale, type PlacedScale } from './scale.js';
import { markerNode } from './symbols.js';
import type { ChartNode, Curve } from './types.js';
import { isStacking, type CheckedCartesianChart, type SeriesOf } from './validate.js';

type CartesianSeries = SeriesOf<'cartesian'>;
type MarkType = CartesianSeries['type'];

// The share of a bar's slot left as a gap between bars side by side.
const BAR_GAP = 0.1;
const MAX_BUBBLE = 60;

/** What a series type is on a cartesian chart. A new type fails to compile until it has an entry. */
interface Mark<S extends CartesianSeries> {
  /** Stands on zero, so its value axis always shows zero. */
  zero: boolean;
  /** Takes a slot of its own beside other series in each band, as bars do. */
  slot: boolean;
  /** How the legend shows it. */
  legend: 'line' | 'box';
  /**
   * How far its marks may reach past the point of their value, on a plot whose shorter side is
   * `plotSize` or less: the plot keeps that much room inside its edges.
   */
  reach: (plotSize: number, entry: S, chartStyle: SketchStyle) => number;
  draw: (context: MarkContext, placed: Placed<S>, paint: Paint) => void;
}

const none = (): number => 0;

const MARKS: { [K in MarkType]: Mark<Extract<CartesianSeries, { type: K }>> } = {
  bar: { zero: true, slot: true, legend: 'box', reach: none, draw: drawBars },
  line: { zero: false, slot: false, legend: 'line', reach: (_size, entry) => entry.symbol ? POINT_SIZE / 2 : 0, draw: drawLine },
  area: { zero: true, slot: false, legend: 'box', reach: none, draw: drawArea },
  rangeArea: { zero: false, slot: false, legend: 'box', reach: none, draw: drawArea },
  interval: { zero: false, slot: true, legend: 'box', reach: () => POINT_SIZE / 2, draw: drawIntervals },
  xRange: { zero: false, slot: true, legend: 'box', reach: () => MILESTONE / 2, draw: drawXRange },
  xyLine: {
    zero: false, slot: false, legend: 'line',
    reach: (_size, entry, style) => Math.max(POINT_SIZE,
      entry.widths?.reduce((max, width) => Math.max(max, width), 0) ?? 0,
      entry.segments?.reduce((max, segment) => Math.max(max, segment?.width ?? 0), 0) ?? 0,
      entry.style.strokeWidth ?? style.strokeWidth ?? LINE_WIDTH) / 2,
    draw: drawXYLine,
  },
  xyArea: { zero: false, slot: false, legend: 'box', reach: none, draw: drawXYArea },
  scatter: { zero: false, slot: false, legend: 'box', reach: () => POINT_SIZE / 2, draw: drawPoints },
  bubble: { zero: false, slot: false, legend: 'box', reach: (size) => bubbleDiameter(size) / 2, draw: drawPoints },
};

/** The diameter of the largest bubble on a plot whose shorter side is `plotSize`. */
function bubbleDiameter(plotSize: number): number {
  return Math.min(MAX_BUBBLE, plotSize / 5);
}

// One cast: the entry for `entry.type` takes exactly that series, which TypeScript cannot follow
// through a lookup by a union key.
function markOf<S extends CartesianSeries>(entry: S): Mark<S> {
  return MARKS[entry.type] as unknown as Mark<S>;
}

/** How the legend shows a series of a cartesian chart. */
export function legendOf(entry: CartesianSeries): 'line' | 'box' {
  return MARKS[entry.type].legend;
}

/** Lays out axes, gridlines and series of a chart with x and y axes into `rect`. */
export function layoutCartesian(drawing: Drawing, chart: CheckedCartesianChart, rect: Rect, paints: Paint[]): void {
  const { x, y, y2, band, series } = chart;
  const horizontal = band === y;
  const linear: Record<AxisKey, CheckedLinearAxis | undefined> = {
    x: x.type === 'linear' ? x : undefined,
    y: y.type === 'linear' ? y : undefined,
    y2,
  };
  const valueAxisOf = (entry: CartesianSeries): AxisKey =>
    'axis' in entry && entry.axis === 'y2' ? 'y2' : horizontal ? 'x' : 'y';
  const spans = spansOf(series, valueAxisOf, linear);
  const cuts = areaCutsOf(series, valueAxisOf);
  // An axis with nothing drawn on it starts at its fixed end, or at 0, or 1 on a log axis.
  const extentOf = (key: AxisKey): [number, number] => {
    const end = linear[key]?.min ?? linear[key]?.max ?? (linear[key]?.kind === 'log' ? 1 : 0);
    const data = extent(key, series, spans, valueAxisOf);
    const values = chart.annotations.flatMap(annotationValues).filter((item) => item.axis === key && typeof item.value === 'number').map((item) => item.value as number);
    if (values.length === 0) return data ?? [end, end];
    return [Math.min(data?.[0] ?? Infinity, ...values), Math.max(data?.[1] ?? -Infinity, ...values)];
  };

  const line = drawing.lineHeight();
  // Points and bubbles are centred on their values, so they reach past them: each end of x and y
  // keeps that much room.
  const reach = Math.max(
    0,
    ...series.map((entry) => markOf(entry).reach(
      Math.min(rect.right - rect.left, rect.bottom - rect.top), entry, chart.style)),
  );
  const room: Record<keyof Rect, EndRoom> = {
    left: endRoom(linear.x, 'min', reach),
    right: endRoom(linear.x, 'max', reach),
    bottom: endRoom(linear.y, 'min', reach),
    top: endRoom(linear.y, 'max', reach),
  };
  // The plot is what is left once the axes have their room: below it the x axis' labels and title,
  // above and below its ends the y axes' end labels, and beside it the y axes' labels and titles.
  const fitPlot = (reserve: Reserve) => {
    const top = rect.top + Math.max(reserve.up, room.top.outside);
    const bottom = rect.bottom - Math.max(reserve.bottom, reserve.down, room.bottom.outside);
    assertRoom({ left: rect.left, top, right: rect.right, bottom }, chart.width, chart.height);
    const yScale = linear.y && scaleOf(linear.y, extentOf('y'), bottom - top);
    const y2Scale = y2 && scaleOf(y2, extentOf('y2'), bottom - top);
    const left = guide('left', 'y', y, yScale, drawing, line);
    const right = y2 && guide('right', 'y2', y2, y2Scale, drawing, line);
    let plotLeft = rect.left + (y.hidden ? 0 : left.depth);
    let plotRight = rect.right - (!right || right.axis.hidden ? 0 : right.depth);
    const xScale = linear.x && scaleOf(linear.x, extentOf('x'), plotRight - plotLeft);
    const below = guide('bottom', 'x', x, xScale, drawing, line);
    // The first and last x labels reach past the ends of the axis.
    plotLeft = Math.max(plotLeft, rect.left + below.ends.left, rect.left + room.left.outside);
    plotRight = Math.min(plotRight, rect.right - below.ends.right, rect.right - room.right.outside);
    // The band axis, if there is one, is x below the plot or y beside it.
    const plot = fitBandEnds({ left: plotLeft, top, right: plotRight, bottom }, band === x ? below : left, rect, chart);
    // Where the values of x and y are placed: the plot, less the room kept inside it.
    const data: Rect = {
      left: plot.left + room.left.inside,
      top: plot.top + room.top.inside,
      right: plot.right - room.right.inside,
      bottom: plot.bottom - room.bottom.inside,
    };
    assertRoom(data, chart.width, chart.height);
    const guides = [below, left, ...(right ? [right] : [])];
    return { plot, data, scales: { x: xScale, y: yScale, y2: y2Scale }, guides };
  };
  // A linear axis' labels are its ticks', and those depend on the plot's size. So room is reserved
  // for ticks over the whole chart first, then again, once, for the plot's own ticks should they
  // reach further, which only rotated labels can.
  const first = reserveFor([
    guide('bottom', 'x', x, linear.x && scaleOf(linear.x, extentOf('x'), rect.right - rect.left), drawing, line),
    guide('left', 'y', y, linear.y && scaleOf(linear.y, extentOf('y'), rect.bottom - rect.top), drawing, line),
    ...(y2 ? [guide('right', 'y2', y2, scaleOf(y2, extentOf('y2'), rect.bottom - rect.top), drawing, line)] : []),
  ]);
  let fitted = fitPlot(first);
  const needed = reserveFor(fitted.guides);
  if (needed.bottom > first.bottom || needed.up > first.up || needed.down > first.down) {
    fitted = fitPlot({
      bottom: Math.max(first.bottom, needed.bottom),
      up: Math.max(first.up, needed.up),
      down: Math.max(first.down, needed.down),
    });
  }
  const { plot, data, guides } = fitted;
  const [xScale, yScale, y2Scale] = [fitted.scales.x, fitted.scales.y, fitted.scales.y2];

  const scales: Record<AxisKey, PlacedScale | undefined> = {
    x: xScale && place(xScale, [data.left, data.right]),
    y: yScale && place(yScale, [data.bottom, data.top]),
    y2: y2Scale && place(y2Scale, [data.bottom, data.top]),
  };
  const across: [number, number] = horizontal ? [plot.top, plot.bottom] : [plot.left, plot.right];
  const bands = band && bandScale(band.categories.length, across, BAND_PADDING, band.weights);
  const frame = makeFrame(plot, horizontal, bands);

  const annotationAt = (key: AxisKey, value: import('./types.js').ChartCoordinate): number => {
    if (typeof value === 'number') return scales[key]!.at(value);
    const index = band!.categories.indexOf(value);
    return bands!.start(index) + bands!.width(index) / 2;
  };
  drawAnnotations(drawing, chart.annotations, 'back', plot, annotationAt);
  for (const entry of guides) {
    drawGrid(drawing, plot, entry, scales[entry.key]);
  }
  const slots = slotsOf(series, valueAxisOf);
  const context: MarkContext = {
    drawing,
    frame,
    categories: band?.categories ?? [],
    slotCount: slots.count,
    x: scales.x,
    xAxis: linear.x,
    largestBubble: largestBubble(series),
  };
  series.forEach((entry, i) => {
    const key = valueAxisOf(entry);
    const placed: Placed = {
      entry,
      axis: linear[key]!,
      scale: scales[key]!,
      spans: spans.get(entry) ?? [],
      slot: slots.slotOf(entry),
      cuts: entry.type === 'area' ? cuts.get(stackOf(entry, valueAxisOf)) : undefined,
    };
    markOf(entry).draw(context, placed, paints[i]!);
  });
  drawAnnotations(drawing, chart.annotations, 'front', plot, annotationAt);
  for (const entry of guides) {
    drawGuide(drawing, plot, entry, scales[entry.key], bands, line);
  }
}

/** Room kept at one end of an axis, outside the plot or inside it. */
interface EndRoom {
  outside: number;
  inside: number;
}

/**
 * The room marks reaching `reach` past their values need at an end of a linear axis. A free end is
 * widened, inside the plot, keeping its ticks; at an end fixed with `min` or `max` the plot keeps the
 * room outside it instead, from the edge of the chart, so a mark there stays on the chart.
 */
function endRoom(axis: CheckedLinearAxis | undefined, end: 'min' | 'max', reach: number): EndRoom {
  if (axis === undefined) {
    return { outside: 0, inside: 0 };
  }
  return axis[end] === undefined ? { outside: 0, inside: reach } : { outside: reach, inside: 0 };
}

/** A series with everything resolved about where it is drawn, once, before it is drawn. */
interface Placed<S extends CartesianSeries = CartesianSeries> {
  entry: S;
  /** The axis of its values, and its placed scale. */
  axis: CheckedLinearAxis;
  scale: PlacedScale;
  /** Where each bar or area of each category starts and ends; empty for scatter and bubbles. */
  spans: Span[];
  /** Its slot beside other series in each band, as bars stand; -1 for a series without one. */
  slot: number;
  /** Where a stacked monotone area splits its runs (`areaCutsOf`); undefined for every other series. */
  cuts: ReadonlySet<number> | undefined;
}

/** What every series of the chart is drawn in. */
interface MarkContext {
  drawing: Drawing;
  frame: Frame;
  categories: readonly string[];
  /** How many slots each band is split into. */
  slotCount: number;
  /** The x scale and axis of a chart with two linear axes. */
  x: PlacedScale | undefined;
  xAxis: CheckedLinearAxis | undefined;
  /** The largest bubble size of the whole chart, so equal sizes draw equal in every series. */
  largestBubble: number;
}

/** The plot and its orientation: marks give positions as [along, value] and get [x, y] back. */
interface Frame {
  plot: Rect;
  /** Whether the value axis runs across, with the bands stacked down the plot. */
  horizontal: boolean;
  /** The centre of category `index`'s band, along the band axis. */
  center: (index: number) => number;
  /** Where category `index`'s band starts, and how wide it is. */
  band: (index: number) => { start: number; width: number };
  point: (position: Point) => Point;
  /** A rectangle from `along`, `thickness` wide, between two positions on the value axis. */
  box: (along: number, thickness: number, from: number, to: number) => Shape;
  /** A line through the points: straight segments as a linear path, a bending curve as a path. */
  line: (points: readonly Point[], curve: Curve) => Shape;
  /** The area between two lines over the same positions: a polygon, or a path for a bending curve. */
  area: (high: readonly Point[], low: readonly Point[], curve: Curve) => Shape;
}

function makeFrame(plot: Rect, horizontal: boolean, bands: BandScale | undefined): Frame {
  return {
    plot,
    horizontal,
    center: (i) => bands!.start(i) + bands!.width(i) / 2,
    band: (i) => ({ start: bands!.start(i), width: bands!.width(i) }),
    point: ([along, value]) => (horizontal ? [value, along] : [along, value]),
    box: (along, thickness, from, to) => {
      const [low, size] = [Math.min(from, to), Math.abs(to - from)];
      return horizontal
        ? { kind: 'rectangle', x: low, y: along, width: size, height: thickness }
        : { kind: 'rectangle', x: along, y: low, width: thickness, height: size };
    },
    // Straight segments cost the stroke engine work in proportion to their points; a path is
    // simplified first, which costs more the more it turns.
    line: (points, curve) => {
      const corners = straightPoints(points, curve, horizontal);
      return corners
        ? { kind: 'linearPath', points: corners }
        : { kind: 'path', d: linePath(points, curve, horizontal) };
    },
    area: (high, low, curve) => {
      const [top, bottom] = [straightPoints(high, curve, horizontal), straightPoints(low, curve, horizontal)];
      return top && bottom
        ? { kind: 'polygon', points: [...top, ...bottom.reverse()] }
        : { kind: 'path', d: areaPath(high, low, curve, horizontal) };
    },
  };
}

/**
 * Where each bar and area of each category starts and ends on its value axis: stacked by stack name
 * (stacked areas have no negative values), as shares of each stack's total on a percent axis. Lines
 * span one value and range areas their pair.
 */
function spansOf(
  series: readonly CartesianSeries[],
  valueAxisOf: (entry: CartesianSeries) => AxisKey,
  linear: Record<AxisKey, CheckedLinearAxis | undefined>,
): Map<CartesianSeries, Span[]> {
  const stacking = series.filter(isStacking);
  const spans: Map<CartesianSeries, Span[]> = stackSpans(
    stacking,
    (entry) => stackOf(entry, valueAxisOf),
    (entry) => linear[valueAxisOf(entry)]?.percent ?? false,
  );
  for (const entry of series) {
    if (entry.type === 'line') {
      spans.set(
        entry,
        entry.data.map((value) => (value === null ? null : [value, value])),
      );
    } else if (entry.type === 'rangeArea' || entry.type === 'interval') {
      spans.set(
        entry,
        entry.data.map((pair) => pair && [pair[0], pair[1]]),
      );
    }
  }
  return spans;
}

/**
 * The categories where each monotone area stack splits its runs, by stack: where a layer's run starts
 * or ends, and where a layer's gap starts or ends between layers drawn below and above it. Two layers
 * then curve every edge they share over the same run, so a gap cannot give that edge a different
 * tangent in each; and where the layer under another changes to a different layer from one category
 * to the next, both sides of that step are straight, so the layers cannot cross there. `runsOf`
 * repeats the point at a cut in the runs on both sides of it, and ignores a cut at a run's first or
 * last point.
 */
function areaCutsOf(
  series: readonly CartesianSeries[],
  valueAxisOf: (entry: CartesianSeries) => AxisKey,
): Map<string, Set<number>> {
  // Each stack's layers, in the order they stack.
  const stacks = new Map<string, (readonly (number | null)[])[]>();
  for (const entry of series) {
    if (entry.type !== 'area' || entry.stack === undefined || entry.curve !== 'monotone') {
      continue;
    }
    const key = stackOf(entry, valueAxisOf);
    stacks.set(key, [...(stacks.get(key) ?? []), entry.data]);
  }
  const groups = new Map<string, Set<number>>();
  for (const [key, layers] of stacks) {
    const cuts = new Set<number>();
    layers.forEach((data, k) => {
      const below = (i: number): boolean => layers.slice(0, k).some((layer) => layer[i] !== null);
      const above = (i: number): boolean => layers.slice(k + 1).some((layer) => layer[i] !== null);
      data.forEach((value, i) => {
        // Past either end, `data[i - 1]` and `data[i + 1]` are undefined: neither a gap nor a value.
        const bordersValue = (i > 0 && data[i - 1] !== null) || (i + 1 < data.length && data[i + 1] !== null);
        if (value !== null && (data[i - 1] === null || data[i + 1] === null)) {
          cuts.add(i);
        } else if (value === null && bordersValue && below(i) && above(i)) {
          cuts.add(i);
        }
      });
    });
    groups.set(key, cuts);
  }
  return groups;
}

/** The series a bar or area stacks with: its own, or every one of its type on its axis with its stack name. */
function stackOf(
  entry: Extract<CartesianSeries, { stack: unknown }>,
  valueAxisOf: (entry: CartesianSeries) => AxisKey,
): string {
  return stackGroup(entry, valueAxisOf(entry));
}

/** The lowest and highest value drawn on the axis, counting zero where a series stands on it. */
function extent(
  key: AxisKey,
  series: readonly CartesianSeries[],
  spans: Map<CartesianSeries, Span[]>,
  valueAxisOf: (entry: CartesianSeries) => AxisKey,
): [number, number] | undefined {
  let low = Infinity;
  let high = -Infinity;
  const take = (value: number): void => {
    low = Math.min(low, value);
    high = Math.max(high, value);
  };
  for (const entry of series) {
    if (entry.type === 'xRange') {
      for (const item of valueAxisOf(entry) === key ? entry.data : []) {
        take(item.from);
        take(item.to ?? item.from);
      }
      continue;
    }
    if (entry.type === 'scatter' || entry.type === 'bubble' || entry.type === 'xyLine' || entry.type === 'xyArea') {
      for (const point of key === 'y2' ? [] : entry.data) {
        if (point === null) continue;
        take(key === 'x' ? point[0] : point[1]);
        if (entry.type === 'xyArea' && key === 'y') take(point[2]!);
      }
      continue;
    }
    if (valueAxisOf(entry) !== key) {
      continue;
    }
    if (markOf(entry).zero) {
      take(0);
    }
    for (const span of spans.get(entry)!) {
      if (span) {
        take(span[0]);
        take(span[1]);
      }
    }
  }
  return low > high ? undefined : [low, high];
}

/** Series that take a slot of their own stand side by side in a band: the slot of each, and how many. */
function slotsOf(
  series: readonly CartesianSeries[],
  valueAxisOf: (entry: CartesianSeries) => AxisKey,
): { slotOf: (entry: CartesianSeries) => number; count: number } {
  const keyOf = (entry: CartesianSeries): string =>
    'stack' in entry ? stackOf(entry, valueAxisOf) : `#${entry.index}`;
  const keys = [...new Set(series.filter((entry) => markOf(entry).slot &&
    !((entry.type === 'interval' || entry.type === 'xRange') && entry.overlay)).map(keyOf))];
  return { slotOf: (entry) => keys.indexOf(keyOf(entry)), count: keys.length };
}

function largestBubble(series: readonly CartesianSeries[]): number {
  let largest = 0;
  for (const entry of series) {
    for (const point of entry.type === 'bubble' ? entry.data : []) {
      largest = Math.max(largest, point[2]);
    }
  }
  return largest;
}

function drawIntervals(
  { drawing, frame, slotCount, categories }: MarkContext,
  { entry, scale, slot, axis }: Placed<Extract<CartesianSeries, { type: 'interval' }>>,
  paint: Paint,
): void {
  entry.data.forEach((pair, i) => {
    if (!pair) return;
    const band = frame.band(i);
    const slotWidth = band.width / (entry.overlay ? 1 : slotCount);
    const center = entry.overlay ? frame.center(i) : band.start + (slot + 0.5) * slotWidth;
    const width = slotWidth * entry.width;
    const [from, to] = pair.map((value) => scale.at(value)) as [number, number];
    const key = [entry.name, categories[i]!, 'interval'];
    const outline = { stroke: paint.color, strokeWidth: LINE_WIDTH };
    const nodes: ChartNode[] = [];
    if (entry.display === 'bar') {
      if (from !== to) nodes.push(drawing.shape(barShape(entry.shape, center - width / 2, width, from, to, frame.point, frame.box), hatched(paint), key, entry.style));
    } else if (entry.display !== 'points') {
      nodes.push(drawing.outline(frame.line([[center, from], [center, to]], 'linear'), outline, key, entry.style));
      if (entry.display === 'error') {
        for (const [end, value] of [from, to].entries()) {
          nodes.push(drawing.outline(frame.line([[center - width / 2, value], [center + width / 2, value]], 'linear'),
            outline, [...key, 'cap', end], entry.style));
        }
      }
    }
    const endpoints = [
      { symbol: entry.fromSymbol ?? (entry.display === 'points' ? 'circle' : undefined), value: from },
      { symbol: entry.toSymbol ?? (entry.display === 'points' ? 'circle' : undefined), value: to },
    ] as const;
    endpoints.forEach(({ symbol, value }, end) => {
      if (symbol) nodes.push(markerNode(drawing, symbol, frame.point([center, value]), POINT_SIZE,
        solid(paint.color), [...key, 'endpoint', end], entry.style));
    });
    if (entry.dataLabels) {
      const [x, y] = frame.point([center, to]);
      nodes.push(drawing.label(formatAxisValue(pair[1], axis), x, y, frame.plot, `${entry.path}.dataLabels`));
    }
    drawing.mark(`${entry.name}, ${categories[i]}: ${formatAxisValue(pair[0], axis)} to ${formatAxisValue(pair[1], axis)}`, nodes);
  });
}

// A milestone's diamond is this many units across, or the width of its slot if that is less.
const MILESTONE = 12;
// Between an item's label and the end of its bar or milestone.
const LABEL_GAP = 4;

function drawXRange(
  { drawing, frame, slotCount, categories }: MarkContext,
  { entry, scale, slot, axis }: Placed<Extract<CartesianSeries, { type: 'xRange' }>>,
  paint: Paint,
): void {
  // Along the value axis, a label of `text` is this long: its width across a horizontal value axis,
  // its height up a vertical one.
  const { horizontal } = frame;
  const lengthOf = (text: string): number => (horizontal ? drawing.width(text) : drawing.lineHeight());
  entry.data.forEach((item, i) => {
    const band = frame.band(item.category);
    const slotWidth = band.width / (entry.overlay ? 1 : slotCount);
    const center = entry.overlay ? frame.center(item.category) : band.start + (slot + 0.5) * slotWidth;
    const width = slotWidth * entry.width;
    const row = categories[item.category]!;
    const key = [entry.name, row, 'xRange', i];
    const from = scale.at(item.from);
    const named = item.label === undefined ? '' : `${item.label}, `;
    const nodes: ChartNode[] = [];
    // Centred on the item where it fits, else past its end, in the direction the item runs.
    const label = (start: number, end: number, direction: number): void => {
      if (!entry.dataLabels || item.label === undefined) return;
      const length = lengthOf(item.label);
      const at = Math.abs(end - start) >= length + 2 * LABEL_GAP ? (start + end) / 2 : end + direction * (LABEL_GAP + length / 2);
      const [x, y] = frame.point([center, at]);
      nodes.push(drawing.label(item.label, x, y, frame.plot, `${entry.path}.dataLabels`));
    };
    if (item.to === undefined) {
      const size = Math.min(MILESTONE, width);
      nodes.push(markerNode(drawing, 'diamond', frame.point([center, from]), size, solid(paint.color), key, entry.style));
      // Rightwards along a horizontal value axis, upwards along a vertical one.
      const direction = horizontal ? 1 : -1;
      label(from, from + (direction * size) / 2, direction);
      drawing.mark(`${entry.name}, ${row}: ${named}${formatAxisValue(item.from, axis)}`, nodes);
      return;
    }
    const to = scale.at(item.to);
    nodes.push(drawing.shape(barShape(entry.shape, center - width / 2, width, from, to, frame.point, frame.box), hatched(paint), key, entry.style));
    const done = item.progress ?? 0;
    if (done > 0) {
      // Solid, half as thick, along the start of the bar.
      nodes.push(drawing.shape(frame.box(center - width / 4, width / 2, from, from + (to - from) * done), solid(paint.color), [...key, 'progress'], entry.style));
    }
    label(from, to, Math.sign(to - from));
    const progress = item.progress === undefined ? '' : `, ${formatValue(item.progress * 100)}% done`;
    drawing.mark(`${entry.name}, ${row}: ${named}${formatAxisValue(item.from, axis)} to ${formatAxisValue(item.to, axis)}${progress}`, nodes);
  });
}

function drawBars(
  context: MarkContext,
  placed: Placed<Extract<CartesianSeries, { type: 'bar' }>>,
  paint: Paint,
): void {
  const { drawing, frame, slotCount } = context;
  const { entry, scale, slot } = placed;
  placed.spans.forEach((span, i) => {
    const value = entry.data[i];
    if (!span || value === null || value === undefined || (span[0] === span[1] && !entry.dataLabels)) {
      return;
    }
    const band = frame.band(i);
    const width = band.width / slotCount;
    const along = band.start + slot * width + (width * BAR_GAP) / 2;
    const category = context.categories[i]!;
    const nodes: ChartNode[] = span[0] === span[1] ? [] : [drawing.shape(
        barShape(entry.shape, along, width * (1 - BAR_GAP), scale.at(span[0]), scale.at(span[1]), frame.point, frame.box),
        hatched(paint),
        [entry.name, category, 'bar'],
        entry.style,
      )];
    if (entry.dataLabels) {
      // At the middle of the bar as drawn, which on a square-root or log axis is not its middle value.
      const [x, y] = frame.point([along + width * (1 - BAR_GAP) / 2, (scale.at(span[0]) + scale.at(span[1])) / 2]);
      nodes.push(drawing.label(formatAxisValue(value, placed.axis), x, y, frame.plot, `${entry.path}.dataLabels`));
    }
    drawing.mark(`${entry.name}, ${category}: ${formatAxisValue(value, placed.axis)}`, nodes);
  });
}

function drawLine(
  context: MarkContext,
  placed: Placed<Extract<CartesianSeries, { type: 'line' }>>,
  paint: Paint,
): void {
  const { drawing, frame } = context;
  const { entry, scale } = placed;
  const points = entry.data.map((value, i): Point | null =>
    value === null ? null : [frame.center(i), scale.at(value)],
  );
  const runs = runsOf(points);
  const style = { stroke: paint.color, strokeWidth: LINE_WIDTH, ...(entry.dash ? { strokeLineDash: entry.dash } : {}) };
  const nodes = runs.map((run, r) => lineOrDot(drawing, frame, run, entry.curve, style, [entry.name, 'line', r], entry.style));
  points.forEach((point, i) => {
    if (!point) return;
    const [x, y] = frame.point(point);
    if (entry.symbol) nodes.push(markerNode(drawing, entry.symbol, [x, y], POINT_SIZE,
      solid(paint.color), [entry.name, 'point', i], entry.style));
    if (entry.dataLabels) nodes.push(drawing.label(formatAxisValue(entry.data[i]!, placed.axis), x, y,
      frame.plot, `${entry.path}.dataLabels`));
  });
  drawing.mark(entry.name, nodes);
}

function drawArea(
  context: MarkContext,
  placed: Placed<Extract<CartesianSeries, { type: 'area' | 'rangeArea' }>>,
  paint: Paint,
): void {
  const { drawing, frame } = context;
  const { entry, scale } = placed;
  const outline = { stroke: paint.color, strokeWidth: LINE_WIDTH };
  const edges = placed.spans.map((span, i) => {
    const along = frame.center(i);
    return span && { from: [along, scale.at(span[0])] as Point, to: [along, scale.at(span[1])] as Point };
  });
  const nodes = piecesOf(edges, placed.cuts).flatMap(({ points: run, run: r, piece }) => {
    const to = run.map((edge) => edge.to);
    const from = run.map((edge) => edge.from);
    const key = [entry.name, 'area', r, piece];
    if (run.length === 1) {
      // A range at one category is the line from its low to its high value; a stacked area's lower
      // edge is the series below, so it shows as its top point, as a line would.
      return [
        entry.type === 'rangeArea'
          ? drawing.outline(frame.line([from[0]!, to[0]!], 'linear'), outline, key, entry.style)
          : lineOrDot(drawing, frame, to, entry.curve, outline, key, entry.style),
      ];
    }
    const fill = frame.area(to, from, entry.curve);
    return [
      drawing.shape(fill, { ...hatched(paint), stroke: 'none' }, [...key, 'fill'], entry.style),
      drawing.outline(frame.line(to, entry.curve), outline, [...key, 'high'], entry.style),
      ...(entry.type === 'rangeArea'
        ? [drawing.outline(frame.line(from, entry.curve), outline, [...key, 'low'], entry.style)]
        : []),
    ];
  });
  drawing.mark(entry.name, nodes);
}

function drawPoints(
  context: MarkContext,
  placed: Placed<Extract<CartesianSeries, { type: 'scatter' | 'bubble' }>>,
  paint: Paint,
): void {
  const { drawing, frame } = context;
  const { entry, scale: y } = placed;
  const x = context.x!;
  const xAxis = context.xAxis!;
  const plotSize = Math.min(frame.plot.right - frame.plot.left, frame.plot.bottom - frame.plot.top);
  const maxDiameter = bubbleDiameter(plotSize);
  entry.data.forEach((point, i) => {
    const [px, py] = point;
    const size = point[2];
    // A bubble's area, not its diameter, is proportional to its size.
    const { largestBubble } = context;
    const diameter =
      size === undefined ? POINT_SIZE : largestBubble === 0 ? 0 : maxDiameter * Math.sqrt(size / largestBubble);
    if (diameter === 0) {
      return;
    }
    const style: SketchStyle = size === undefined ? solid(paint.color) : hatched(paint);
    const sizeText = size === undefined ? '' : `, size ${formatValue(size)}`;
    drawing.mark(`${entry.name}: ${formatAxisValue(px, xAxis)}, ${formatAxisValue(py, placed.axis)}${sizeText}`, [
      markerNode(drawing, entry.symbol, [x.at(px), y.at(py)], diameter, style, [entry.name, i], entry.style),
      ...(entry.dataLabels ? [drawing.label(formatAxisValue(py, placed.axis), x.at(px), y.at(py), frame.plot,
        `${entry.path}.dataLabels`)] : []),
    ]);
  });
}

/** A run of two or more points as a line; a lone point, which a line cannot show, as a dot. */
function lineOrDot(
  drawing: Drawing,
  frame: Frame,
  run: readonly Point[],
  curve: Curve,
  style: { stroke: string; strokeWidth: number },
  key: SeedKey,
  own: SketchStyle,
): ChartNode {
  if (run.length === 1) {
    return loneDot(drawing, frame.point(run[0]!), style.stroke, key, own);
  }
  return drawing.outline(frame.line(run, curve), style, key, own);
}
