import type { Point, Shape, SketchStyle } from '@borrowdale/core';
import { coordinate } from './curves.js';
import type { Drawing } from './drawing.js';
import { assertRoom, BAND_PADDING, GAP, type Rect } from './frame.js';
import {
  alignTowards,
  fitSweep,
  isWholeTurn,
  polarFrame,
  RADIANS,
  RIM_SHARE,
  rimTicks,
  sliceShape,
  type PolarFrame,
} from './geometry.js';
import { loneDot, POINT_SIZE, runsOf, solid } from './marks.js';
import { GRID, GRID_WIDTH, hatched, LINE_WIDTH, type Paint } from './palette.js';
import { bandScale, formatValue, linearScale, place, PLAIN_FORMAT, type PlacedScale } from './scale.js';
import { stackGroup, stackSpans, type Span } from './stack.js';
import type { ChartNode } from './types.js';
import {
  isStacking,
  type CheckedFormat,
  type CheckedLinearAxis,
  type CheckedPolarChart,
  type SeriesOf,
} from './validate.js';

type PolarSeries = SeriesOf<'polar'>;
type PolarType = PolarSeries['type'];

/** Where values or categories go on one of a polar chart's axes, by the axis' type. */
type PolarScale =
  | { type: 'linear'; path: string; scale: PlacedScale }
  | {
      type: 'band';
      path: string;
      /** The middle of category `index`'s slot, and half its width. */
      slot: (index: number) => { middle: number; half: number };
    };

// Each series type declares the axis types it needs (SERIES_RULES), and validation holds every
// series to them, so these only throw if a type's rule and its drawing disagree.
function linearOf(axis: PolarScale): PlacedScale {
  if (axis.type !== 'linear') {
    throw new Error(`${axis.path} is a band axis where a series needs a linear one`);
  }
  return axis.scale;
}

function bandOf(axis: PolarScale): (index: number) => { middle: number; half: number } {
  if (axis.type !== 'band') {
    throw new Error(`${axis.path} is a linear axis where a series needs a band one`);
  }
  return axis.slot;
}

/** A line from the centre out to the rim: its angle, its gridline's key, and its label. */
interface Spoke {
  angle: number;
  key: number;
  label: string;
}

interface PolarContext {
  drawing: Drawing;
  frame: PolarFrame;
  /** Angles, in degrees clockwise from the top. */
  angle: PolarScale;
  /** Distances from the centre. */
  radius: PolarScale;
  categories: readonly string[];
  /** How tooltips write values on each axis. */
  formats: { angle: CheckedFormat; radius: CheckedFormat };
  /** Where each value of a stacking series starts and ends. */
  spansOf: (entry: PolarSeries) => Span[];
  /** Series that take a share of their own beside others in each category, as bars do. */
  slots: { slotOf: (entry: PolarSeries) => number; count: number };
  /** Whether the angle axis goes the whole way round, so a line through every category closes. */
  whole: boolean;
}

/** What a series type is on a polar chart. A new type fails to compile until it has an entry. */
interface PolarMark<S extends PolarSeries> {
  /** Every value the series puts on each axis; none on a band axis. */
  angle: (entry: S, spans: Span[] | undefined) => number[];
  radius: (entry: S, spans: Span[] | undefined) => number[];
  /** Stands on zero, so its value axis always shows zero. */
  zero: boolean;
  /** Takes a share of its own beside other series in each category, as bars do. */
  slot: boolean;
  /** How the legend shows it. */
  legend: 'line' | 'box';
  draw: (context: PolarContext, entry: S, paint: Paint) => void;
}

const spanValues = (_entry: unknown, spans: Span[] | undefined): number[] =>
  (spans ?? []).flatMap((span) => span ?? []);
const plainValues = (entry: { data: readonly (number | null)[] }): number[] =>
  entry.data.filter((value): value is number => value !== null);

const none = (): number[] => [];

const POLAR_MARKS: { [K in PolarType]: PolarMark<Extract<PolarSeries, { type: K }>> } = {
  radar: {
    angle: none,
    radius: (entry) => entry.data.flat(),
    zero: false,
    slot: false,
    legend: 'box',
    draw: drawRadar,
  },
  rose: { angle: none, radius: spanValues, zero: true, slot: true, legend: 'box', draw: drawWedges },
  radialBar: { angle: spanValues, radius: none, zero: true, slot: true, legend: 'box', draw: drawWedges },
  polarLine: { angle: none, radius: plainValues, zero: false, slot: false, legend: 'line', draw: drawPolarLine },
  polarArea: { angle: none, radius: spanValues, zero: true, slot: false, legend: 'box', draw: drawPolarArea },
  polarScatter: {
    angle: (entry) => entry.data.map(([a]) => a),
    radius: (entry) => entry.data.map(([, r]) => r),
    zero: false,
    slot: false,
    legend: 'box',
    draw: drawPolarPoints,
  },
};

// One cast, as for the cartesian marks: the entry for `entry.type` takes exactly that series.
function polarMarkOf<S extends PolarSeries>(entry: S): PolarMark<S> {
  return POLAR_MARKS[entry.type] as unknown as PolarMark<S>;
}

/** How the legend shows a series of a polar chart. */
export function polarLegendOf(entry: PolarSeries): 'line' | 'box' {
  return POLAR_MARKS[entry.type].legend;
}

/**
 * Lays out a polar chart into `rect`: categories or values around the circle clockwise from the top,
 * and values or categories out from the centre, as large as fits with the labels around it.
 */
export function layoutPolar(drawing: Drawing, chart: CheckedPolarChart, rect: Rect, paints: Paint[]): void {
  const { angle: angleAxis, radius: radiusAxis, series } = chart;
  const { startAngle, endAngle } = angleAxis;
  const sweep = endAngle - startAngle;
  const whole = isWholeTurn(startAngle, endAngle);
  const line = drawing.lineHeight();
  const stacking = series.filter(isStacking);
  const spans: Map<PolarSeries, Span[]> = stackSpans(
    stacking,
    (entry) => stackGroup(entry, 'polar'),
    () => false,
  );
  const extentOf = (axis: 'angle' | 'radius'): [number, number] | undefined => {
    let [low, high] = [Infinity, -Infinity];
    for (const entry of series) {
      const mark = polarMarkOf(entry);
      const values = mark[axis](entry, spans.get(entry));
      for (const value of [...values, ...(mark.zero && values.length > 0 ? [0] : [])]) {
        [low, high] = [Math.min(low, value), Math.max(high, value)];
      }
    }
    return low > high ? undefined : [low, high];
  };

  // Ticks around the rim, spaced as along a straight axis of the arc's length less its labels: about
  // half of the arc, measured before the labels decide the radius.
  const rimLength = (Math.min(rect.right - rect.left, rect.bottom - rect.top) / 2) * sweep * RADIANS * RIM_SHARE;
  const angleScale =
    angleAxis.type === 'linear' ? linearScale(angleAxis, endsOf(angleAxis, extentOf('angle')), rimLength) : undefined;
  const rim = angleScale && rimTicks(angleScale, whole);
  const rimLabels = angleAxis.hidden ? [] : angleAxis.type === 'band' ? angleAxis.categories : rim!.labels;
  // The labels around the rim decide how much room the circle leaves.
  const widest = Math.max(0, ...rimLabels.map((label) => drawing.width(label)));
  const room = angleAxis.hidden ? 0 : GAP;
  const depth = angleAxis.hidden ? 0 : line;
  let frame: PolarFrame;
  if (whole) {
    const radius = Math.min((rect.right - rect.left) / 2 - widest - room, (rect.bottom - rect.top) / 2 - depth - room);
    assertRoom({ left: 0, top: 0, right: radius, bottom: radius }, chart.width, chart.height);
    frame = polarFrame(
      [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2],
      radius,
      radius * radiusAxis.innerRadius,
    );
  } else {
    const inner = {
      left: rect.left + widest + room,
      top: rect.top + depth + room,
      right: rect.right - widest - room,
      bottom: rect.bottom - depth - room,
    };
    assertRoom(inner, chart.width, chart.height);
    const { center, radius } = fitSweep(inner, startAngle, endAngle, radiusAxis.innerRadius);
    frame = polarFrame(center, radius, radius * radiusAxis.innerRadius);
  }
  const { radius, hole } = frame;

  const angle: PolarScale =
    angleAxis.type === 'linear'
      ? { type: 'linear', path: angleAxis.path, scale: place(angleScale!, [startAngle, endAngle]) }
      : {
          type: 'band',
          path: angleAxis.path,
          slot: bandAround(angleAxis.categories.length, startAngle, sweep, whole),
        };
  const radiusPlace: PolarScale =
    radiusAxis.type === 'linear'
      ? {
          type: 'linear',
          path: radiusAxis.path,
          scale: place(linearScale(radiusAxis, endsOf(radiusAxis, extentOf('radius'), true), radius - hole), [
            hole,
            radius,
          ]),
        }
      : { type: 'band', path: radiusAxis.path, slot: ringsOf(radiusAxis.categories.length, hole, radius) };
  const spokes: Spoke[] =
    angleAxis.type === 'band'
      ? angleAxis.categories.map((label, k) => ({ angle: bandOf(angle)(k).middle, key: k, label }))
      : rim!.ticks.map((tick, i) => ({ angle: linearOf(angle).at(tick), key: tick, label: rim!.labels[i]! }));
  const grid = { stroke: GRID, strokeWidth: GRID_WIDTH };

  if (radiusPlace.type === 'linear' && radiusAxis.type === 'linear' && !radiusAxis.hidden && radiusAxis.grid) {
    const { scale } = radiusPlace;
    for (const tick of scale.ticks.filter((tick) => tick > scale.domain[0])) {
      const distance = scale.at(tick);
      const shape: Shape =
        radiusAxis.shape === 'polygon'
          ? { kind: 'polygon', points: spokes.map((spoke) => frame.point(spoke.angle, distance)) }
          : circleOrArc(frame, distance, startAngle, endAngle, whole);
      drawing.push(drawing.shape(shape, grid, `grid|radius|${tick}`));
    }
  }
  // A band angle axis always draws its spokes, a radar's web; a linear one only as gridlines.
  if (angleAxis.type === 'band' || (!angleAxis.hidden && angleAxis.grid)) {
    for (const spoke of spokes) {
      const [[x1, y1], [x2, y2]] = [frame.point(spoke.angle, hole), frame.point(spoke.angle, radius)];
      drawing.push(drawing.shape({ kind: 'line', x1, y1, x2, y2 }, grid, `spoke|${spoke.key}`));
    }
  }

  const band = angleAxis.type === 'band' ? angleAxis : radiusAxis.type === 'band' ? radiusAxis : undefined;
  const context: PolarContext = {
    drawing,
    frame,
    angle,
    radius: radiusPlace,
    categories: band?.categories ?? [],
    formats: {
      angle: angleAxis.type === 'linear' ? angleAxis.format : PLAIN_FORMAT,
      radius: radiusAxis.type === 'linear' ? radiusAxis.format : PLAIN_FORMAT,
    },
    spansOf: (entry) => spans.get(entry)!,
    slots: slotsOf(
      series.filter((entry) => polarMarkOf(entry).slot),
      (entry) => ('stack' in entry ? stackGroup(entry, 'polar') : `#${entry.index}`),
    ),
    whole,
  };
  series.forEach((entry, i) => polarMarkOf(entry).draw(context, entry, paints[i]!));

  if (radiusPlace.type === 'linear' && !radiusAxis.hidden) {
    const { scale } = radiusPlace;
    scale.ticks.forEach((tick, i) => {
      if (tick > scale.domain[0]) {
        const [px, py] = frame.point(startAngle, scale.at(tick));
        drawing.push(drawing.text(scale.labels[i]!, { x: px + GAP / 2, y: py, anchor: 'start', baseline: 'middle' }));
      }
    });
  }
  if (radiusPlace.type === 'band' && radiusAxis.type === 'band' && !radiusAxis.hidden) {
    radiusAxis.categories.forEach((category, k) => {
      const [px, py] = frame.point(startAngle, radiusPlace.slot(k).middle);
      drawing.push(drawing.text(category, { x: px - GAP / 2, y: py, anchor: 'end', baseline: 'middle' }));
    });
  }
  if (!angleAxis.hidden) {
    for (const spoke of spokes) {
      const [px, py] = frame.point(spoke.angle, radius + GAP);
      drawing.push(drawing.text(spoke.label, { x: px, y: py, ...alignTowards(spoke.angle, true) }));
    }
  }
}

/** The data's extent on a value axis, from 0 on a radius axis that sets no `min`. */
function endsOf(axis: CheckedLinearAxis, extent: [number, number] | undefined, fromZero = false): [number, number] {
  if (!extent) {
    const end = axis.min ?? axis.max ?? 0;
    return [end, end];
  }
  return [fromZero && axis.min === undefined ? 0 : extent[0], extent[1]];
}

/** Categories around the circle: on a whole turn the first at the start, else each centred in its share. */
function bandAround(
  count: number,
  start: number,
  sweep: number,
  whole: boolean,
): (index: number) => { middle: number; half: number } {
  return (index) => ({
    middle: whole ? start + (index * sweep) / count : start + ((index + 0.5) * sweep) / count,
    half: sweep / count / 2,
  });
}

/**
 * Rings out from the centre between `hole` and `radius`, the first category outermost, as the first
 * is topmost on a horizontal bar chart.
 */
function ringsOf(count: number, hole: number, radius: number): (index: number) => { middle: number; half: number } {
  const rings = bandScale(count, [hole, radius], BAND_PADDING);
  return (index) => {
    const start = rings.start(count - 1 - index);
    return { middle: start + rings.bandwidth / 2, half: rings.bandwidth / 2 };
  };
}

function circleOrArc(frame: PolarFrame, distance: number, from: number, to: number, whole: boolean): Shape {
  const [cx, cy] = frame.center;
  if (whole) {
    return { kind: 'circle', cx, cy, diameter: 2 * distance };
  }
  const at = (a: number): string => {
    const [px, py] = frame.point(a, distance);
    return `${coordinate(px)} ${coordinate(py)}`;
  };
  const arc = (a: number): string => ` A${coordinate(distance)} ${coordinate(distance)} 0 0 1 ${at(a)}`;
  return { kind: 'path', d: `M${at(from)}${arc((from + to) / 2)}${arc(to)}` };
}

/** Series that take a share of their own stand side by side in each category: the share of each, and how many. */
function slotsOf(series: readonly PolarSeries[], keyOf: (entry: PolarSeries) => string): PolarContext['slots'] {
  const keys = [...new Set(series.map(keyOf))];
  return { slotOf: (entry) => keys.indexOf(keyOf(entry)), count: keys.length };
}

/** A radar's outline through its values on the spokes, or a range radar's band between its pairs. */
function drawRadar(context: PolarContext, entry: Extract<PolarSeries, { type: 'radar' }>, paint: Paint): void {
  const { drawing, frame, angle, radius } = context;
  const around = (values: readonly number[]): Point[] =>
    values.map((value, k) => frame.point(bandOf(angle)(k).middle, linearOf(radius).at(value)));
  const style = { ...hatched(paint), strokeWidth: LINE_WIDTH };
  const key = `${entry.name}|radar`;
  if (isRanges(entry.data)) {
    const [low, high] = [around(entry.data.map(([value]) => value)), around(entry.data.map(([, value]) => value))];
    // The inner outline a hole in the outer, by the even-odd rule the engine fills paths with.
    const band: Shape = { kind: 'path', d: `${pathThrough(high)} Z ${pathThrough(low)} Z` };
    drawing.mark(entry.name, [drawing.shape(band, style, key, entry.style)]);
    return;
  }
  drawing.mark(entry.name, [drawing.shape({ kind: 'polygon', points: around(entry.data) }, style, key, entry.style)]);
}

function isRanges(
  data: readonly number[] | readonly (readonly [number, number])[],
): data is readonly (readonly [number, number])[] {
  return Array.isArray(data[0]);
}

/**
 * The wedges of a rose, one per category around the circle, or the bars of a radial bar chart, one
 * ring per category: each from where its value starts to where it ends, in its share of the
 * category beside the other series.
 */
function drawWedges(
  context: PolarContext,
  entry: Extract<PolarSeries, { type: 'rose' | 'radialBar' }>,
  paint: Paint,
): void {
  const { drawing, frame, slots } = context;
  const [across, along, format] =
    entry.type === 'rose'
      ? [context.angle, context.radius, context.formats.radius]
      : [context.radius, context.angle, context.formats.angle];
  const slot = slots.slotOf(entry);
  context.spansOf(entry).forEach((span, i) => {
    const value = entry.data[i];
    if (!span || value === null || value === undefined || span[0] === span[1]) {
      return;
    }
    const { middle, half } = bandOf(across)(i);
    const width = (2 * half) / slots.count;
    const start = middle - half + slot * width;
    const [a, b] = [linearOf(along).at(span[0]), linearOf(along).at(span[1])];
    const [low, high] = [Math.min(a, b), Math.max(a, b)];
    const shape =
      entry.type === 'rose'
        ? sliceShape(frame.center, high, low, start, start + width)
        : sliceShape(frame.center, start + width, start, low, high);
    const category = context.categories[i]!;
    drawing.mark(`${entry.name}, ${category}: ${formatValue(value, format)}`, [
      drawing.shape(shape, hatched(paint), `${entry.name}|${category}|${entry.type}`, entry.style),
    ]);
  });
}

function drawPolarLine(context: PolarContext, entry: Extract<PolarSeries, { type: 'polarLine' }>, paint: Paint): void {
  const { drawing, frame, angle, radius } = context;
  const [slot, at] = [bandOf(angle), linearOf(radius).at];
  const points = entry.data.map((value, k) => (value === null ? null : frame.point(slot(k).middle, at(value))));
  const style = { stroke: paint.color, strokeWidth: LINE_WIDTH, ...(entry.dash ? { strokeLineDash: entry.dash } : {}) };
  drawing.mark(
    entry.name,
    polarRuns(points, context.whole).map((run, r) =>
      polyline(drawing, run, style, `${entry.name}|polarLine|${r}`, entry.style),
    ),
  );
}

function drawPolarArea(context: PolarContext, entry: Extract<PolarSeries, { type: 'polarArea' }>, paint: Paint): void {
  const { drawing, frame, angle, radius } = context;
  const outline = { stroke: paint.color, strokeWidth: LINE_WIDTH };
  const [slot, at] = [bandOf(angle), linearOf(radius).at];
  const edges = context.spansOf(entry).map((span, k) => {
    const a = slot(k).middle;
    return span && { from: frame.point(a, at(span[0])), to: frame.point(a, at(span[1])) };
  });
  const nodes = polarRuns(edges, context.whole).flatMap((run, r) => {
    const key = `${entry.name}|polarArea|${r}`;
    const to = run.points.map((edge) => edge.to);
    if (to.length === 1) {
      return [polyline(drawing, { points: to, closed: false }, outline, key, entry.style)];
    }
    const from = run.points.map((edge) => edge.from);
    const fill: Shape = run.closed
      ? { kind: 'path', d: `${pathThrough(to)} Z ${pathThrough(from)} Z` }
      : { kind: 'polygon', points: [...to, ...from.reverse()] };
    return [
      drawing.shape(fill, { ...hatched(paint), stroke: 'none' }, `${key}|fill`, entry.style),
      polyline(drawing, { points: to, closed: run.closed }, outline, `${key}|high`, entry.style),
    ];
  });
  drawing.mark(entry.name, nodes);
}

function drawPolarPoints(
  context: PolarContext,
  entry: Extract<PolarSeries, { type: 'polarScatter' }>,
  paint: Paint,
): void {
  const { drawing, frame, angle, radius, formats } = context;
  entry.data.forEach(([a, r], i) => {
    const [cx, cy] = frame.point(linearOf(angle).at(a), linearOf(radius).at(r));
    drawing.mark(`${entry.name}: ${formatValue(a, formats.angle)}, ${formatValue(r, formats.radius)}`, [
      drawing.shape(
        { kind: 'circle', cx, cy, diameter: POINT_SIZE },
        solid(paint.color),
        `${entry.name}|${i}`,
        entry.style,
      ),
    ]);
  });
}

/**
 * The runs between nulls. On a whole turn with no null the one run closes back to its start, as a
 * radar's outline does; with nulls, the last run joins the first across the start.
 */
function polarRuns<T>(entries: readonly (T | null)[], whole: boolean): { points: T[]; closed: boolean }[] {
  const runs = runsOf(entries);
  const gaps = entries.includes(null);
  const closed = whole && !gaps && runs.length === 1 && runs[0]!.length >= 3;
  // On a whole turn the last category is next to the first, so a run that ends the data goes on
  // into the run that starts it.
  if (whole && gaps && entries[0] !== null && entries.at(-1) !== null && runs.length > 1) {
    runs[0] = [...runs.pop()!, ...runs[0]!];
  }
  return runs.map((points) => ({ points, closed }));
}

/** A run of points as an outline, closed or open; a lone point, which a line cannot show, as a dot. */
function polyline(
  drawing: Drawing,
  { points, closed }: { points: Point[]; closed: boolean },
  style: SketchStyle & { stroke: string },
  key: string,
  own: SketchStyle,
): ChartNode {
  if (points.length === 1) {
    return loneDot(drawing, points[0]!, style.stroke, key, own);
  }
  const shape: Shape = closed ? { kind: 'polygon', points } : { kind: 'linearPath', points };
  return drawing.shape(shape, closed ? { ...style, fill: 'none' } : style, key, own);
}

function pathThrough(points: readonly Point[]): string {
  return points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${coordinate(px)} ${coordinate(py)}`).join(' ');
}
