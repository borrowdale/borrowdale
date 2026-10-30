import type { Point, Shape, SketchStyle } from '@borrowdale/core';
import { cos, sin } from '@borrowdale/core/math';
import type { TextAnchor, TextBaseline } from '@borrowdale/text';
import type { CheckedAxis, CheckedLinearAxis } from './check-axis.js';
import { areaPath, linePath, straightPoints } from './curves.js';
import type { Drawing, Extent, SeedKey } from './drawing.js';
import { assertRoom, BAND_PADDING, GAP, TICK, type Rect } from './frame.js';
import { loneDot, piecesOf, POINT_SIZE, runsOf, solid } from './marks.js';
import { GRID, GRID_WIDTH, hatched, INK, LINE_WIDTH, type Paint } from './palette.js';
import { fail } from './read.js';
import { stackGroup, stackSpans, type Span } from './stack.js';
import { bandScale, formatValue, linearScale, place, type BandScale, type PlacedScale, type Scale } from './scale.js';
import type { ChartNode, Curve } from './types.js';
import { isStacking, type CheckedCartesianChart, type SeriesOf } from './validate.js';

type CartesianSeries = SeriesOf<'cartesian'>;
type MarkType = CartesianSeries['type'];
type AxisKey = 'x' | 'y' | 'y2';

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
  reach: (plotSize: number) => number;
  draw: (context: MarkContext, placed: Placed<S>, paint: Paint) => void;
}

const none = (): number => 0;

const MARKS: { [K in MarkType]: Mark<Extract<CartesianSeries, { type: K }>> } = {
  bar: { zero: true, slot: true, legend: 'box', reach: none, draw: drawBars },
  line: { zero: false, slot: false, legend: 'line', reach: none, draw: drawLine },
  area: { zero: true, slot: false, legend: 'box', reach: none, draw: drawArea },
  rangeArea: { zero: false, slot: false, legend: 'box', reach: none, draw: drawArea },
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
  // An axis with nothing drawn on it starts at its fixed end, or shows 0 to 1.
  const extentOf = (key: AxisKey): [number, number] => {
    const end = linear[key]?.min ?? linear[key]?.max ?? 0;
    return extent(key, series, spans, valueAxisOf) ?? [end, end];
  };

  const line = drawing.lineHeight();
  // Points and bubbles are centred on their values, so they reach past them. An end of a linear axis
  // that is not fixed is widened by that much, keeping its ticks; at a fixed end, the plot keeps
  // that much room from the edges of the chart, so a mark there stays on the chart.
  const reach = Math.max(
    0,
    ...series.map((entry) => markOf(entry).reach(Math.min(rect.right - rect.left, rect.bottom - rect.top))),
  );
  const fixed = (key: 'x' | 'y', end: 'min' | 'max'): number =>
    linear[key]?.[end] === undefined ? 0 : reach;
  const widened = (key: 'x' | 'y', end: 'min' | 'max'): number =>
    linear[key] && linear[key][end] === undefined ? reach : 0;
  // The plot is what is left once the axes have their room: below it the x axis' labels and title,
  // above and below its ends the y axes' end labels, and beside it the y axes' labels and titles.
  const fitPlot = (reserve: Reserve) => {
    const top = rect.top + Math.max(reserve.up, fixed('y', 'max'));
    const bottom = rect.bottom - Math.max(reserve.bottom, reserve.down, fixed('y', 'min'));
    assertRoom({ left: rect.left, top, right: rect.right, bottom }, chart.width, chart.height);
    const yScale = linear.y && linearScale(linear.y, extentOf('y'), bottom - top);
    const y2Scale = y2 && linearScale(y2, extentOf('y2'), bottom - top);
    const left = guide('left', 'y', y, yScale, drawing, line);
    const right = y2 && guide('right', 'y2', y2, y2Scale, drawing, line);
    let plotLeft = rect.left + (y.hidden ? 0 : left.depth);
    let plotRight = rect.right - (!right || right.axis.hidden ? 0 : right.depth);
    const xScale = linear.x && linearScale(linear.x, extentOf('x'), plotRight - plotLeft);
    const below = guide('bottom', 'x', x, xScale, drawing, line);
    // The first and last x labels reach past the ends of the axis.
    plotLeft = Math.max(plotLeft, rect.left + below.ends.left, rect.left + fixed('x', 'min'));
    plotRight = Math.min(plotRight, rect.right - below.ends.right, rect.right - fixed('x', 'max'));
    const plot = fitBandEnds(
      { left: plotLeft, top, right: plotRight, bottom },
      [below, left],
      rect,
      (label, side) => (side === 'bottom' ? drawing.width(label) / 2 : line / 2),
      chart,
    );
    assertRoom(
      {
        left: plot.left + widened('x', 'min'),
        top: plot.top + widened('y', 'max'),
        right: plot.right - widened('x', 'max'),
        bottom: plot.bottom - widened('y', 'min'),
      },
      chart.width,
      chart.height,
    );
    return { plot, scales: { x: xScale, y: yScale, y2: y2Scale }, guides: [below, left, ...(right ? [right] : [])] };
  };
  // A linear axis' labels are its ticks', and those depend on the plot's size. So room is reserved
  // for ticks over the whole chart first, then again, once, for the plot's own ticks should they
  // reach further, which only rotated labels can.
  const first = reserveFor([
    guide('bottom', 'x', x, linear.x && linearScale(linear.x, extentOf('x'), rect.right - rect.left), drawing, line),
    guide('left', 'y', y, linear.y && linearScale(linear.y, extentOf('y'), rect.bottom - rect.top), drawing, line),
    ...(y2 ? [guide('right', 'y2', y2, linearScale(y2, extentOf('y2'), rect.bottom - rect.top), drawing, line)] : []),
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
  const { plot, guides } = fitted;
  const [xScale, yScale, y2Scale] = [fitted.scales.x, fitted.scales.y, fitted.scales.y2];

  const scales: Record<AxisKey, PlacedScale | undefined> = {
    x: xScale && place(xScale, [plot.left + widened('x', 'min'), plot.right - widened('x', 'max')]),
    y: yScale && place(yScale, [plot.bottom - widened('y', 'min'), plot.top + widened('y', 'max')]),
    y2: y2Scale && place(y2Scale, [plot.bottom, plot.top]),
  };
  const across: [number, number] = horizontal ? [plot.top, plot.bottom] : [plot.left, plot.right];
  const bands = band && bandScale(band.categories.length, across, BAND_PADDING);
  const frame = makeFrame(plot, horizontal, bands);

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
  for (const entry of guides) {
    drawGuide(drawing, plot, entry, scales[entry.key], bands, line);
  }
}

// How many times the plot is narrowed to keep a band axis' end labels on the chart.
const MAX_REFITS = 20;
// How far a label may reach past the chart's padding through rounding: positions are written with
// two decimals.
const LABEL_ROUNDING = 0.005;

/**
 * The plot narrowed so that the end labels of its flat band axis stay inside `rect`. Band labels are
 * centred on their bands, so the first and last shown can reach past the ends of the axis. Each time
 * the plot is narrowed by what they still reach out, which narrows the bands and moves the labels out
 * again, but by less, until they fit. A lone label wider than the chart never fits, and throws.
 */
function fitBandEnds(
  plot: Rect,
  guides: readonly Guide[],
  rect: Rect,
  halfOf: (label: string, side: Side) => number,
  chart: { width: number; height: number },
): Rect {
  const guide = guides.find(({ axis }) => axis.type === 'band' && !axis.hidden && axis.labelAngle === 0);
  if (!guide) {
    return plot;
  }
  const { labels, room, side } = guide;
  const [start, end] = side === 'bottom' ? (['left', 'right'] as const) : (['top', 'bottom'] as const);
  let fitted = plot;
  for (let refit = 0; refit <= MAX_REFITS; refit++) {
    assertRoom(fitted, chart.width, chart.height);
    const bands = bandScale(labels.length, [fitted[start], fitted[end]], BAND_PADDING);
    const every = labelEvery(room, bands.step);
    const last = Math.floor((labels.length - 1) / every) * every;
    const center = (i: number): number => bands.start(i) + bands.bandwidth / 2;
    const before = rect[start] - (center(0) - halfOf(labels[0]!, side));
    const after = center(last) + halfOf(labels[last]!, side) - rect[end];
    if (before <= LABEL_ROUNDING && after <= LABEL_ROUNDING) {
      return fitted;
    }
    fitted = { ...fitted, [start]: fitted[start] + Math.max(0, before), [end]: fitted[end] - Math.max(0, after) };
  }
  return fail(`a ${chart.width} × ${chart.height} chart`, `leaves no room for the end labels of ${guide.axis.path}`);
}

/** How many labels `spacing` apart to step over, to keep one that does not overlap the last. */
function labelEvery(room: number, spacing: number): number {
  return Math.max(1, Math.ceil(room / spacing));
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
    center: (i) => bands!.start(i) + bands!.bandwidth / 2,
    band: (i) => ({ start: bands!.start(i), width: bands!.bandwidth }),
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
    } else if (entry.type === 'rangeArea') {
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
    if (entry.type === 'scatter' || entry.type === 'bubble') {
      for (const point of key === 'y2' ? [] : entry.data) {
        take(key === 'x' ? point[0] : point[1]);
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
  const keys = [...new Set(series.filter((entry) => markOf(entry).slot).map(keyOf))];
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

function drawBars(
  context: MarkContext,
  placed: Placed<Extract<CartesianSeries, { type: 'bar' }>>,
  paint: Paint,
): void {
  const { drawing, frame, slotCount } = context;
  const { entry, scale, slot } = placed;
  placed.spans.forEach((span, i) => {
    const value = entry.data[i];
    if (!span || value === null || value === undefined || span[0] === span[1]) {
      return;
    }
    const band = frame.band(i);
    const width = band.width / slotCount;
    const along = band.start + slot * width + (width * BAR_GAP) / 2;
    const category = context.categories[i]!;
    drawing.mark(`${entry.name}, ${category}: ${valueText(value, placed.axis)}`, [
      drawing.shape(
        frame.box(along, width * (1 - BAR_GAP), scale.at(span[0]), scale.at(span[1])),
        hatched(paint),
        [entry.name, category, 'bar'],
        entry.style,
      ),
    ]);
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
  drawing.mark(
    entry.name,
    runs.map((run, r) => lineOrDot(drawing, frame, run, entry.curve, style, [entry.name, 'line', r], entry.style)),
  );
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
    drawing.mark(`${entry.name}: ${valueText(px, xAxis)}, ${valueText(py, placed.axis)}${sizeText}`, [
      drawing.shape({ kind: 'circle', cx: x.at(px), cy: y.at(py), diameter }, style, [entry.name, i], entry.style),
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

/** A value in a tooltip, in its axis format; on a percent axis it is the value, not its share. */
function valueText(value: number, axis: CheckedLinearAxis): string {
  return formatValue(value, { ...axis.format, suffix: axis.percent ? '' : axis.format.suffix });
}

// Axes

type Side = 'bottom' | 'left' | 'right';

/** An axis as drawn at one side of the plot: its labels, measured once. */
interface Guide {
  side: Side;
  key: AxisKey;
  axis: CheckedAxis;
  /** Tick labels of a linear axis, or the categories of a band axis. */
  labels: readonly string[];
  /** How far its labels reach out from the axis, beyond the tick and the gap. */
  reach: number;
  /** How much room a label needs along the axis, to thin out labels that would overlap. */
  room: number;
  /** How far its end labels reach past the ends of the axis: left and right, or up and down. */
  ends: Extent;
  /** How a label sits at its tick, over the side's own placing: rotated labels' anchor and turn. */
  style: Partial<ReturnType<typeof labelStyle>>;
  /** How far the axis reaches out from the plot: tick, gap, labels and title. */
  depth: number;
}

/** The room an axis' labels need below the plot and above and below its ends. */
interface Reserve {
  bottom: number;
  up: number;
  down: number;
}

function reserveFor(guides: readonly Guide[]): Reserve {
  const [below, ...sides] = guides;
  const shown = sides.filter((side) => !side.axis.hidden);
  return {
    bottom: below!.axis.hidden ? 0 : below!.depth,
    up: Math.max(0, ...shown.map((side) => side.ends.up)),
    down: Math.max(0, ...shown.map((side) => side.ends.down)),
  };
}

const NO_ENDS: Extent = { left: 0, right: 0, up: 0, down: 0 };

/**
 * An axis at one side of the plot with its labels measured. Flat labels take one line below the plot
 * and the widest label's width beside it; a linear axis' end labels, centred on its end ticks, reach
 * half their width past the ends below the plot, and half a line beside it, while a band axis' sit
 * inside. Rotated labels take their rotated bounds. Every label's tick is within the plot, so the
 * plot leaves room past its ends for the furthest any label reaches either way: the most a label may
 * need, which leaves room to spare for all but the end ones.
 */
function guide(
  side: Side,
  key: AxisKey,
  axis: CheckedAxis,
  scale: Scale | undefined,
  drawing: Drawing,
  line: number,
): Guide {
  const labels = axis.type === 'band' ? axis.categories : scale!.labels;
  const angle = axis.labelAngle;
  const [first, last] = [labels[0] ?? '', labels.at(-1) ?? ''];
  const shown = (ends: Extent): Extent => (axis.hidden ? NO_ENDS : ends);
  if (angle === 0) {
    const widest = Math.max(0, ...labels.map((label) => drawing.width(label)));
    const reach = side === 'bottom' ? line : widest;
    const ends =
      axis.type === 'band'
        ? NO_ENDS
        : side === 'bottom'
          ? { ...NO_ENDS, left: drawing.width(first) / 2, right: drawing.width(last) / 2 }
          : { ...NO_ENDS, up: line / 2, down: line / 2 };
    const room = SIDES[side].room(widest, line);
    return { side, key, axis, labels, reach, room, ends: shown(ends), style: {}, depth: depthOf(reach, axis, line) };
  }
  const style = labelStyle(side, angle);
  const extents = labels.map((label) => drawing.extent(label, style));
  const most = (of: (extent: Extent) => number): number => Math.max(0, ...extents.map(of));
  const reach = most((extent) => (side === 'bottom' ? extent.down : side === 'left' ? extent.left : extent.right));
  // Along the axis, a slanted label needs its line height divided by the sine of its slant to clear
  // the next one, or its whole extent, whichever is less.
  const radians = (angle * Math.PI) / 180;
  const room =
    side === 'bottom'
      ? Math.min(
          most((extent) => extent.left + extent.right),
          line / Math.abs(sin(radians)),
        ) + GAP
      : Math.min(
          most((extent) => extent.up + extent.down),
          line / Math.abs(cos(radians)),
        ) +
        GAP / 2;
  const ends =
    side === 'bottom'
      ? { ...NO_ENDS, left: most((extent) => extent.left), right: most((extent) => extent.right) }
      : { ...NO_ENDS, up: most((extent) => extent.up), down: most((extent) => extent.down) };
  return { side, key, axis, labels, reach, room, ends: shown(ends), style, depth: depthOf(reach, axis, line) };
}

/** How a rotated label is anchored at its tick: ending there on the left of it, starting there on the right. */
function labelStyle(side: Side, angle: number): { anchor: TextAnchor; baseline: TextBaseline; rotate: number } {
  switch (side) {
    case 'bottom':
      return { anchor: angle < 0 ? 'end' : 'start', baseline: 'top', rotate: angle };
    case 'left':
      return { anchor: 'end', baseline: 'middle', rotate: angle };
    case 'right':
      return { anchor: 'start', baseline: 'middle', rotate: angle };
  }
}

// How far an axis reaches out from the plot: tick, gap, its labels' `reach` and its title.
function depthOf(reach: number, axis: CheckedAxis, line: number): number {
  return TICK + GAP + reach + titleDepth(axis, line);
}

function titleDepth(axis: CheckedAxis, line: number): number {
  return axis.title === undefined ? 0 : GAP + line;
}

interface SideRules {
  /** The axis line, along the plot's edge. */
  edge: (plot: Rect) => [number, number, number, number];
  /** A tick mark at position `at` on the axis. */
  tick: (plot: Rect, at: number) => [number, number, number, number];
  /** A gridline across the plot at `at`. */
  grid: (plot: Rect, at: number) => [number, number, number, number];
  /** Where a label goes, at position `at`. */
  label: (plot: Rect, at: number) => { x: number; y: number; anchor: TextAnchor; baseline: TextBaseline };
  /** How much room a label needs along the axis, to thin out labels that would overlap. */
  room: (widest: number, line: number) => number;
  /** Where the title goes, beyond the labels; side titles are rotated to read along the axis. */
  title: (plot: Rect, reach: number, line: number) => { x: number; y: number; rotate: number };
}

const SIDES: Record<Side, SideRules> = {
  bottom: {
    edge: (p) => [p.left, p.bottom, p.right, p.bottom],
    tick: (p, at) => [at, p.bottom, at, p.bottom + TICK],
    grid: (p, at) => [at, p.bottom, at, p.top],
    label: (p, at) => ({ x: at, y: p.bottom + TICK + GAP, anchor: 'middle', baseline: 'top' }),
    room: (widest) => widest + GAP,
    title: (p, reach) => ({ x: (p.left + p.right) / 2, y: p.bottom + TICK + GAP + reach + GAP, rotate: 0 }),
  },
  left: {
    edge: (p) => [p.left, p.top, p.left, p.bottom],
    tick: (p, at) => [p.left, at, p.left - TICK, at],
    grid: (p, at) => [p.left, at, p.right, at],
    label: (p, at) => ({ x: p.left - TICK - GAP, y: at, anchor: 'end', baseline: 'middle' }),
    room: (_widest, line) => line + GAP / 2,
    // Read from bottom to top; once rotated its line height is its width.
    title: (p, reach, line) => ({
      x: p.left - TICK - GAP - reach - GAP - line,
      y: (p.top + p.bottom) / 2,
      rotate: -90,
    }),
  },
  right: {
    edge: (p) => [p.right, p.top, p.right, p.bottom],
    tick: (p, at) => [p.right, at, p.right + TICK, at],
    grid: (p, at) => [p.left, at, p.right, at],
    label: (p, at) => ({ x: p.right + TICK + GAP, y: at, anchor: 'start', baseline: 'middle' }),
    room: (_widest, line) => line + GAP / 2,
    title: (p, reach, line) => ({
      x: p.right + TICK + GAP + reach + GAP + line,
      y: (p.top + p.bottom) / 2,
      rotate: 90,
    }),
  },
};

function lineShape([x1, y1, x2, y2]: [number, number, number, number]): Shape {
  return { kind: 'line', x1, y1, x2, y2 };
}

function drawGrid(drawing: Drawing, plot: Rect, { side, key, axis }: Guide, scale: PlacedScale | undefined): void {
  if (axis.type !== 'linear' || axis.hidden || !axis.grid) {
    return;
  }
  for (const tick of scale!.ticks) {
    const shape = lineShape(SIDES[side].grid(plot, scale!.at(tick)));
    drawing.push(drawing.outline(shape, { stroke: GRID, strokeWidth: GRID_WIDTH }, ['grid', key, tick]));
  }
}

function drawGuide(
  drawing: Drawing,
  plot: Rect,
  guide: Guide,
  scale: PlacedScale | undefined,
  bands: BandScale | undefined,
  line: number,
): void {
  const { side, key, axis, labels, reach, room } = guide;
  if (axis.hidden) {
    return;
  }
  const rules = SIDES[side];
  const ink = { stroke: INK, strokeWidth: 1 };
  const every = (spacing: number): number => labelEvery(room, spacing);
  const label = (at: number) => ({ ...rules.label(plot, at), ...guide.style });
  drawing.push(drawing.outline(lineShape(rules.edge(plot)), ink, ['axis', key]));
  if (axis.type === 'linear') {
    // Ticks are evenly spaced, and a lone tick has nothing to overlap.
    const [first, second] = scale!.ticks;
    const nth = every(second === undefined ? Infinity : Math.abs(scale!.at(second) - scale!.at(first!)));
    scale!.ticks.forEach((tick, i) => {
      const at = scale!.at(tick);
      drawing.push(drawing.outline(lineShape(rules.tick(plot, at)), ink, ['tick', key, tick]));
      if (i % nth === 0) {
        drawing.push(drawing.text(labels[i]!, label(at)));
      }
    });
  } else {
    const nth = every(bands!.step);
    labels.forEach((name, i) => {
      if (i % nth === 0) {
        drawing.push(drawing.text(name, label(bands!.start(i) + bands!.bandwidth / 2)));
      }
    });
  }
  if (axis.title !== undefined) {
    // Along the side it is on, as long as the plot.
    const room = side === 'bottom' ? plot.right - plot.left : plot.bottom - plot.top;
    const title = drawing.fit(axis.title, room, `${axis.path}.title`);
    drawing.push(drawing.text(title, { ...rules.title(plot, reach, line), anchor: 'middle', baseline: 'top' }));
  }
}
