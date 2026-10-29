import type { Point, Shape, SketchStyle } from '@borrowdale/core';
import { cos, sin } from '@borrowdale/core/math';
import type { TextAnchor, TextBaseline } from '@borrowdale/text';
import { BAND_PADDING, POINT_SIZE } from './cartesian.js';
import { coordinate } from './curves.js';
import type { Drawing } from './drawing.js';
import { assertRoom, GAP, type Rect } from './frame.js';
import { GRID, GRID_WIDTH, hatched, LINE_WIDTH, type Paint } from './palette.js';
import {
  bandScale,
  formatNumber,
  formatValue,
  linearScale,
  place,
  PLAIN_FORMAT,
  type PlacedScale,
  type Scale,
} from './scale.js';
import { stackGroup, stackSpans, type Span } from './stack.js';
import type { ChartNode } from './types.js';
import {
  isStacking,
  TURN_ROUNDING,
  type CheckedFormat,
  type CheckedLinearAxis,
  type CheckedPieChart,
  type CheckedPolarChart,
  type SeriesOf,
} from './validate.js';

const RADIANS = Math.PI / 180;
// Beyond this share of a unit vector's length off an axis, a label is placed to that side.
const SIDE = 0.01;
// The share of the rim's length that ticks around it are spaced along.
const RIM_SHARE = 0.5;

/** The point `degrees` clockwise from the top of a circle of radius 1 around the origin. */
export function onCircle(degrees: number): Point {
  const radians = degrees * RADIANS;
  return [sin(radians), -cos(radians)];
}

/**
 * Lays out a pie or donut, or nested rings of them, into `rect`, as large as fits with every slice
 * pulled out by its offset. `paintOf` gives each slice name its legend entry's paint.
 */
export function layoutPie(drawing: Drawing, chart: CheckedPieChart, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  assertRoom(rect, chart.width, chart.height);
  const { series } = chart;
  const { startAngle, endAngle } = series[0]!;
  const outermost = Math.max(...series.map((pie) => pie.outerRadius));
  const innermost = Math.min(...series.map((pie) => pie.innerRadius));
  const offset = Math.max(...series.flatMap((pie) => pie.data.map((slice) => slice.offset)));
  const fitted = fitSweep(rect, startAngle, endAngle, innermost / outermost);
  const { center } = fitted;
  const radius = (offset === 0 ? fitted.radius : fitted.radius / (1 + offset)) / outermost;

  for (const pie of series) {
    const total = pie.data.reduce((sum, slice) => sum + slice.value, 0);
    const largest = Math.max(...pie.data.map((slice) => slice.radius ?? 0));
    const [outer, hole] = [radius * pie.outerRadius, radius * pie.innerRadius];
    // Space between slices only where there is more than one slice to part.
    const pad = pie.data.filter((slice) => slice.value > 0).length > 1 ? pie.padAngle / 2 : 0;
    let angle = startAngle;
    pie.data.forEach((slice) => {
      const from = angle;
      angle += (slice.value / total) * (endAngle - startAngle);
      // A slice whose sweep rounds to nothing, or that the space between slices takes up, has nothing
      // to draw.
      if (!(angle - pad > from + pad)) {
        return;
      }
      const reach = slice.radius === undefined ? outer : hole + ((outer - hole) * slice.radius) / largest;
      const [dx, dy] = onCircle((from + angle) / 2);
      const pulled: Point = slice.offset === 0 ? center : [center[0] + slice.offset * radius * dx, center[1] + slice.offset * radius * dy];
      const share = formatNumber((slice.value / total) * 100, 1, PLAIN_FORMAT);
      const ring = series.length === 1 ? '' : `${pie.name}, `;
      drawing.mark(`${ring}${slice.name}: ${formatValue(slice.value)} (${share}%)`, [
        drawing.shape(
          sliceShape(pulled, reach, hole, from + pad, angle - pad, pie.cornerRadius),
          hatched(paintOf.get(slice.name)!),
          `${pie.name}|${slice.name}|slice`,
          pie.style,
        ),
      ]);
    });
  }
}

/**
 * The centre and radius of the largest part of a circle from `startAngle` to `endAngle` that fits in
 * `rect`, with a hole of `innerRadius` times the radius: its extent is that of its ends, the quarter
 * turns between them, and the centre or the ends of the hole.
 */
export function fitSweep(rect: Rect, startAngle: number, endAngle: number, innerRadius: number): { center: Point; radius: number } {
  const quarters = Array.from({ length: 16 }, (_, i) => (Math.floor(startAngle / 90) + i) * 90).filter(
    (angle) => angle > startAngle && angle < endAngle,
  );
  const outer = [startAngle, endAngle, ...quarters].map(onCircle);
  const inner =
    innerRadius === 0 ? [[0, 0] as Point] : [startAngle, endAngle].map((angle) => scaled(onCircle(angle), innerRadius));
  const xs = [...outer, ...inner].map(([px]) => px);
  const ys = [...outer, ...inner].map(([, py]) => py);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const radius = Math.min((rect.right - rect.left) / (maxX - minX), (rect.bottom - rect.top) / (maxY - minY));
  const center: Point = [
    (rect.left + rect.right) / 2 - (radius * (minX + maxX)) / 2,
    (rect.top + rect.bottom) / 2 - (radius * (minY + maxY)) / 2,
  ];
  return { center, radius };
}

/**
 * A slice from `from` to `to` degrees between `hole` and `radius`, a ring when it is a whole turn,
 * with its corners rounded to `corner` where there is room for them.
 */
export function sliceShape([cx, cy]: Point, radius: number, hole: number, from: number, to: number, corner = 0): Shape {
  const whole = to - from >= 360 - TURN_ROUNDING;
  if (hole === 0 && whole) {
    return { kind: 'circle', cx, cy, diameter: 2 * radius };
  }
  const at = (r: number, angle: number): string => {
    const [px, py] = onCircle(angle);
    return `${coordinate(cx + r * px)} ${coordinate(cy + r * py)}`;
  };
  // An arc whose ends round to one point is dropped, by SVG and the stroke engine alike, as one arc
  // over nearly a whole turn would be. So each edge is two arcs that meet at the middle of the
  // slice, and neither sweeps more than half a turn.
  const middle = (from + to) / 2;
  const arcTo = (r: number, angle: number, clockwise: boolean): string =>
    ` A${coordinate(r)} ${coordinate(r)} 0 0 ${clockwise ? 1 : 0} ${at(r, angle)}`;
  const edge = (r: number, end: number, clockwise: boolean): string =>
    `${arcTo(r, middle, clockwise)}${arcTo(r, end, clockwise)}`;
  if (whole) {
    // A ring: the outer and the inner circle, the inner a hole by the even-odd rule the engine fills
    // paths with.
    const outer = `M${at(radius, from)}${edge(radius, from, true)} Z`;
    return { kind: 'path', d: `${outer} M${at(hole, from)}${edge(hole, from, false)} Z` };
  }
  if (corner > 0) {
    return { kind: 'path', d: roundedSlice(at, edge, [cx, cy], radius, hole, from, to, corner) };
  }
  // A path, not core's arc shape, whose sampling makes a thin slice cost more the thinner it is.
  const start = hole === 0 ? `M${coordinate(cx)} ${coordinate(cy)} L${at(radius, from)}` : `M${at(radius, from)}`;
  const back = hole === 0 ? '' : ` L${at(hole, to)}${edge(hole, from, false)}`;
  return { kind: 'path', d: `${start}${edge(radius, to, true)}${back} Z` };
}

/**
 * A slice's path with its corners rounded: each corner is cut where the edges are `corner` from it,
 * and a quadratic curve through the corner joins the cuts. A corner shrinks to fit half its edges.
 * The tip of a pie slice, at the centre, stays sharp.
 */
function roundedSlice(
  at: (r: number, angle: number) => string,
  edge: (r: number, end: number, clockwise: boolean) => string,
  [cx, cy]: Point,
  radius: number,
  hole: number,
  from: number,
  to: number,
  corner: number,
): string {
  const half = ((to - from) * RADIANS) / 2;
  const outer = Math.min(corner, (radius - hole) / 2, radius * half);
  // The cut along the arc, in degrees.
  const outerTurn = outer / radius / RADIANS;
  const rim = `Q${at(radius, from)} ${at(radius, from + outerTurn)}${edge(radius, to - outerTurn, true)} Q${at(radius, to)} ${at(radius - outer, to)}`;
  if (hole === 0) {
    return `M${coordinate(cx)} ${coordinate(cy)} L${at(radius - outer, from)} ${rim} Z`;
  }
  const inner = Math.min(corner, (radius - hole) / 2, hole * half);
  const innerTurn = inner / hole / RADIANS;
  const back = `Q${at(hole, to)} ${at(hole, to - innerTurn)}${edge(hole, from + innerTurn, false)} Q${at(hole, from)} ${at(hole + inner, from)}`;
  return `M${at(radius - outer, from)} ${rim} L${at(hole + inner, to)} ${back} Z`;
}

type PolarSeries = SeriesOf<'polar'>;
type PolarType = PolarSeries['type'];

/** A polar chart's place: its centre and radius, and the points around it. */
interface PolarFrame {
  center: Point;
  radius: number;
  /** The radius of the hole in the middle. */
  hole: number;
  /** The point `distance` from the centre, `degrees` clockwise from the top. */
  point: (degrees: number, distance: number) => Point;
}

function polarFrame([cx, cy]: Point, radius: number, hole: number): PolarFrame {
  return {
    center: [cx, cy],
    radius,
    hole,
    point: (degrees, distance) => {
      const [dx, dy] = onCircle(degrees);
      return [cx + distance * dx, cy + distance * dy];
    },
  };
}

/** Where values and categories go on one of a polar chart's axes. */
interface PolarScale {
  /** The value axis' placed scale; undefined on a band axis. */
  linear: PlacedScale | undefined;
  /** The middle of category `index`, and the half width of its share. */
  band: (index: number) => { middle: number; half: number };
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

const spanValues = (_entry: unknown, spans: Span[] | undefined): number[] => (spans ?? []).flatMap((span) => span ?? []);
const plainValues = (entry: { data: readonly (number | null)[] }): number[] =>
  entry.data.filter((value): value is number => value !== null);

const none = (): number[] => [];

const POLAR_MARKS: { [K in PolarType]: PolarMark<Extract<PolarSeries, { type: K }>> } = {
  radar: { angle: none, radius: (entry) => entry.data.flat(), zero: false, slot: false, legend: 'box', draw: drawRadar },
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
  const whole = sweep >= 360 - TURN_ROUNDING;
  const line = drawing.lineHeight();
  const stacking = series.filter(isStacking);
  const spans: Map<PolarSeries, Span[]> = stackSpans(stacking, (entry) => stackGroup(entry, 'polar'), () => false);
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

  // The labels around the rim decide how much room the circle leaves.
  // Ticks around the rim, spaced as along a straight axis of the arc's length less its labels: about
  // half of the arc, measured before the labels decide the radius.
  const rimLength = (Math.min(rect.right - rect.left, rect.bottom - rect.top) / 2) * sweep * RADIANS * RIM_SHARE;
  const angleScale = angleAxis.type === 'linear' ? linearScale(angleAxis, endsOf(angleAxis, extentOf('angle')), rimLength) : undefined;
  const rimLabels = angleAxis.hidden ? [] : angleAxis.type === 'band' ? angleAxis.categories : rimTicks(angleScale!, whole).labels;
  const widest = Math.max(0, ...rimLabels.map((label) => drawing.width(label)));
  const room = angleAxis.hidden ? 0 : GAP;
  const depth = angleAxis.hidden ? 0 : line;
  let frame: PolarFrame;
  if (whole) {
    const radius = Math.min((rect.right - rect.left) / 2 - widest - room, (rect.bottom - rect.top) / 2 - depth - room);
    assertRoom({ left: 0, top: 0, right: radius, bottom: radius }, chart.width, chart.height);
    frame = polarFrame([(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2], radius, radius * radiusAxis.innerRadius);
  } else {
    const inner = { left: rect.left + widest + room, top: rect.top + depth + room, right: rect.right - widest - room, bottom: rect.bottom - depth - room };
    assertRoom(inner, chart.width, chart.height);
    const { center, radius } = fitSweep(inner, startAngle, endAngle, radiusAxis.innerRadius);
    frame = polarFrame(center, radius, radius * radiusAxis.innerRadius);
  }
  const { radius, hole } = frame;

  const angle: PolarScale = {
    linear: angleScale && place(angleScale, [startAngle, endAngle]),
    band: bandAround(angleAxis.type === 'band' ? angleAxis.categories.length : 0, startAngle, sweep, whole),
  };
  const radiusScale =
    radiusAxis.type === 'linear'
      ? place(linearScale(radiusAxis, endsOf(radiusAxis, extentOf('radius'), true), radius - hole), [hole, radius])
      : undefined;
  const rings = radiusAxis.type === 'band' ? bandScale(radiusAxis.categories.length, [hole, radius], BAND_PADDING) : undefined;
  const ringCount = radiusAxis.type === 'band' ? radiusAxis.categories.length : 0;
  const radiusPlace: PolarScale = {
    linear: radiusScale,
    // The first category outermost, as the first is topmost on a horizontal bar chart.
    band: (index) => {
      const start = rings!.start(ringCount - 1 - index);
      return { middle: start + rings!.bandwidth / 2, half: rings!.bandwidth / 2 };
    },
  };
  const grid = { stroke: GRID, strokeWidth: GRID_WIDTH };

  if (radiusScale && !radiusAxis.hidden && radiusAxis.type === 'linear' && radiusAxis.grid) {
    for (const tick of radiusScale.ticks.filter((tick) => tick > radiusScale.domain[0])) {
      const distance = radiusScale.at(tick);
      const shape: Shape =
        radiusAxis.shape === 'polygon'
          ? { kind: 'polygon', points: spokeAngles(angleAxis, angle).map((a) => frame.point(a, distance)) }
          : circleOrArc(frame, distance, startAngle, endAngle, whole);
      drawing.push(drawing.shape(shape, grid, `grid|radius|${tick}`));
    }
  }
  if (angleAxis.type === 'band' || (!angleAxis.hidden && angleAxis.grid)) {
    const keys = angleAxis.type === 'band' ? angleAxis.categories.map((_, k) => k) : rimTicks(angle.linear!, whole).ticks;
    spokeAngles(angleAxis, angle).forEach((a, i) => {
      const [[x1, y1], [x2, y2]] = [frame.point(a, hole), frame.point(a, radius)];
      drawing.push(drawing.shape({ kind: 'line', x1, y1, x2, y2 }, grid, `spoke|${keys[i]}`));
    });
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
    slots: slotsOf(series.filter((entry) => polarMarkOf(entry).slot), (entry) => ('stack' in entry ? stackGroup(entry, 'polar') : `#${entry.index}`)),
    whole,
  };
  series.forEach((entry, i) => polarMarkOf(entry).draw(context, entry, paints[i]!));

  if (radiusScale && !radiusAxis.hidden) {
    radiusScale.ticks.forEach((tick, i) => {
      if (tick > radiusScale.domain[0]) {
        const [px, py] = frame.point(startAngle, radiusScale.at(tick));
        drawing.push(drawing.text(radiusScale.labels[i]!, { x: px + GAP / 2, y: py, anchor: 'start', baseline: 'middle' }));
      }
    });
  }
  if (radiusAxis.type === 'band' && !radiusAxis.hidden) {
    radiusAxis.categories.forEach((category, k) => {
      const [px, py] = frame.point(startAngle, radiusPlace.band(k).middle);
      drawing.push(drawing.text(category, { x: px - GAP / 2, y: py, anchor: 'end', baseline: 'middle' }));
    });
  }
  if (!angleAxis.hidden) {
    spokeAngles(angleAxis, angle).forEach((a, i) => {
      const [px, py] = frame.point(a, radius + GAP);
      const [dx, dy] = onCircle(a);
      const anchor: TextAnchor = dx > SIDE ? 'start' : dx < -SIDE ? 'end' : 'middle';
      const baseline: TextBaseline = dy < -SIDE ? 'bottom' : dy > SIDE ? 'top' : 'middle';
      drawing.push(drawing.text(rimLabels[i]!, { x: px, y: py, anchor, baseline }));
    });
  }
}

/** The data's extent on a value axis, from 0 on a radius axis that sets no `min`. */
function endsOf(axis: CheckedPolarChart['angle' | 'radius'], extent: [number, number] | undefined, fromZero = false): [number, number] {
  const linear = axis as CheckedLinearAxis;
  if (!extent) {
    const end = linear.min ?? linear.max ?? 0;
    return [end, end];
  }
  return [fromZero && linear.min === undefined ? 0 : extent[0], extent[1]];
}

/** Categories around the circle: on a whole turn the first at the start, else each centred in its share. */
function bandAround(count: number, start: number, sweep: number, whole: boolean): PolarScale['band'] {
  return (index) => ({
    middle: whole ? start + (index * sweep) / count : start + ((index + 0.5) * sweep) / count,
    half: sweep / count / 2,
  });
}

/** The ticks of a linear angle axis that get a spoke and a label: on a whole turn the end is the start. */
export function rimTicks(scale: Scale, whole: boolean): { ticks: number[]; labels: string[] } {
  const last = scale.ticks.length - 1;
  const repeats = whole && last > 0 && scale.fraction(scale.ticks[last]!) === 1 && scale.fraction(scale.ticks[0]!) === 0;
  return repeats ? { ticks: scale.ticks.slice(0, last), labels: scale.labels.slice(0, last) } : scale;
}

/** The angle of each spoke: each category's middle, or each tick of a linear angle axis. */
function spokeAngles(axis: CheckedPolarChart['angle'], angle: PolarScale): number[] {
  return axis.type === 'band'
    ? axis.categories.map((_, k) => angle.band(k).middle)
    : rimTicks(angle.linear!, axis.endAngle - axis.startAngle >= 360 - TURN_ROUNDING).ticks.map((tick) => angle.linear!.at(tick));
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
    values.map((value, k) => frame.point(angle.band(k).middle, radius.linear!.at(value)));
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

function isRanges(data: readonly number[] | readonly (readonly [number, number])[]): data is readonly (readonly [number, number])[] {
  return Array.isArray(data[0]);
}

/**
 * The wedges of a rose, one per category around the circle, or the bars of a radial bar chart, one
 * ring per category: each from where its value starts to where it ends, in its share of the
 * category beside the other series.
 */
function drawWedges(context: PolarContext, entry: Extract<PolarSeries, { type: 'rose' | 'radialBar' }>, paint: Paint): void {
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
    const { middle, half } = across.band(i);
    const width = (2 * half) / slots.count;
    const start = middle - half + slot * width;
    const [a, b] = [along.linear!.at(span[0]), along.linear!.at(span[1])];
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
  const points = entry.data.map((value, k) => (value === null ? null : frame.point(angle.band(k).middle, radius.linear!.at(value))));
  const style = { stroke: paint.color, strokeWidth: LINE_WIDTH, ...(entry.dash ? { strokeLineDash: entry.dash } : {}) };
  drawing.mark(
    entry.name,
    polarRuns(points, context.whole).map((run, r) => polyline(drawing, run, style, `${entry.name}|polarLine|${r}`, entry.style)),
  );
}

function drawPolarArea(context: PolarContext, entry: Extract<PolarSeries, { type: 'polarArea' }>, paint: Paint): void {
  const { drawing, frame, angle, radius } = context;
  const outline = { stroke: paint.color, strokeWidth: LINE_WIDTH };
  const edges = context.spansOf(entry).map((span, k) => {
    const a = angle.band(k).middle;
    return span && { from: frame.point(a, radius.linear!.at(span[0])), to: frame.point(a, radius.linear!.at(span[1])) };
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

function drawPolarPoints(context: PolarContext, entry: Extract<PolarSeries, { type: 'polarScatter' }>, paint: Paint): void {
  const { drawing, frame, angle, radius } = context;
  const { formats } = context;
  entry.data.forEach(([a, r], i) => {
    const [cx, cy] = frame.point(angle.linear!.at(a), radius.linear!.at(r));
    const style = { stroke: paint.color, fill: paint.color, fillStyle: 'solid' as const };
    drawing.mark(`${entry.name}: ${formatValue(a, formats.angle)}, ${formatValue(r, formats.radius)}`, [
      drawing.shape({ kind: 'circle', cx, cy, diameter: POINT_SIZE }, style, `${entry.name}|${i}`, entry.style),
    ]);
  });
}

/**
 * The runs between nulls. On a whole turn with no null the one run closes back to its start, as a
 * radar's outline does; with nulls, the last run joins the first across the start.
 */
function polarRuns<T>(entries: readonly (T | null)[], whole: boolean): { points: T[]; closed: boolean }[] {
  const runs: T[][] = [[]];
  for (const entry of entries) {
    if (entry === null) {
      runs.push([]);
    } else {
      runs.at(-1)!.push(entry);
    }
  }
  const closed = whole && runs.length === 1 && runs[0]!.length >= 3;
  // On a whole turn the last category is next to the first, so a run that ends the data goes on
  // into the run that starts it.
  if (whole && runs.length > 1 && runs[0]!.length > 0 && runs.at(-1)!.length > 0) {
    runs[0] = [...runs.pop()!, ...runs[0]!];
  }
  return runs.filter((run) => run.length > 0).map((points) => ({ points, closed }));
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
    const [cx, cy] = points[0]!;
    const dot = { stroke: style.stroke, fill: style.stroke, fillStyle: 'solid' as const };
    return drawing.shape({ kind: 'circle', cx, cy, diameter: POINT_SIZE * 0.7 }, dot, key, own);
  }
  const shape: Shape = closed ? { kind: 'polygon', points } : { kind: 'linearPath', points };
  return drawing.shape(shape, closed ? { ...style, fill: 'none' } : style, key, own);
}

function pathThrough(points: readonly Point[]): string {
  return points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${coordinate(px)} ${coordinate(py)}`).join(' ');
}

function scaled([px, py]: Point, factor: number): Point {
  return [px * factor, py * factor];
}
