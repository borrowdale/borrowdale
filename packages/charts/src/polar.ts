import { markerNode } from './symbols.js';
import type { Point, Shape, SketchStyle } from '@borrowdale/core';
import type { TextAnchor, TextBaseline } from '@borrowdale/text';
import type { CheckedFormat, CheckedLinearAxis } from './check-axis.js';
import { categoryIndex } from './cell-series.js';
import { colorAxisOf, type ColorScale } from './color-scale.js';
import { coordinate } from './curves.js';
import type { Drawing, SeedKey } from './drawing.js';
import { aChart, assertRoom, BAND_PADDING, GAP, type Rect } from './frame.js';
import {
  alignTowards,
  fitSweep,
  isWholeTurn,
  labelledRim,
  onCircle,
  polarFrame,
  RADIANS,
  RIM_SHARE,
  rimTicks,
  sliceShape,
  type PolarFrame,
} from './geometry.js';
import { loneDot, POINT_SIZE, runsOf, solid, valueCell, valueTitle } from './marks.js';
import { GRID, GRID_WIDTH, hatched, LINE_WIDTH, type Paint } from './palette.js';
import { fail } from './read.js';
import { bandScale, emptyExtent, formatValue, place, PLAIN_FORMAT, scaleOf, type PlacedScale } from './scale.js';
import { stackGroup, stackSpans, type Span } from './stack.js';
import type { ChartNode } from './types.js';
import { isStacking, type CheckedPolarChart, type SeriesOf } from './validate.js';

// How far past the chart's box a label may reach and still count as inside: rounding.
const FIT_TOLERANCE = 0.01;
// How many times the circle is fitted again to keep the radius axis' labels on the chart.
const MAX_REFITS = 20;

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
  rect: Rect;
  frame: PolarFrame;
  /** Angles, in degrees clockwise from the top. */
  angle: PolarScale;
  /** Distances from the centre. */
  radius: PolarScale;
  categories: readonly string[];
  /** How tooltips write values on each axis. */
  formats: { angle: CheckedFormat; radius: CheckedFormat };
  /** How many shares each category is split into, for series that take one of their own, as bars do. */
  slotCount: number;
  /** Whether the angle axis goes the whole way round, so a line through every category closes. */
  whole: boolean;
  /** The colour axis, for series coloured by value. */
  color: ColorScale | undefined;
}

/** A series with everything resolved about where it is drawn, once, before it is drawn. */
interface PolarPlaced<S extends PolarSeries = PolarSeries> {
  entry: S;
  /** Where each value of a stacking series starts and ends; empty for every other series. */
  spans: Span[];
  /** Its share beside other series in each category; -1 for a series without one. */
  slot: number;
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
  draw: (context: PolarContext, placed: PolarPlaced<S>, paint: Paint) => void;
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
  polarHeatmap: { angle: none, radius: none, zero: false, slot: false, legend: 'box', draw: drawPolarHeatmap },
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
    angleAxis.type === 'linear' ? scaleOf(angleAxis, endsOf(angleAxis, extentOf('angle')), rimLength) : undefined;
  const rim = angleScale && rimTicks(angleScale, whole);
  const rimLabels = angleAxis.hidden ? [] : angleAxis.type === 'band' ? angleAxis.categories : rim!.labels;
  // The labels around the rim decide how much room the circle leaves.
  const widest = Math.max(0, ...rimLabels.map((label) => drawing.width(label)));
  const room = angleAxis.hidden ? 0 : GAP;
  const depth = angleAxis.hidden ? 0 : line;
  // The circle as large as fits in `box` with the rim's labels around it, and its radius axis placed.
  const fitIn = (box: Rect): { frame: PolarFrame; radiusPlace: PolarScale } => {
    let frame: PolarFrame;
    if (whole) {
      const radius = Math.min((box.right - box.left) / 2 - widest - room, (box.bottom - box.top) / 2 - depth - room);
      assertRoom({ left: 0, top: 0, right: radius, bottom: radius }, chart.width, chart.height);
      frame = polarFrame(
        [(box.left + box.right) / 2, (box.top + box.bottom) / 2],
        radius,
        radius * radiusAxis.innerRadius,
      );
    } else {
      const inner = {
        left: box.left + widest + room,
        top: box.top + depth + room,
        right: box.right - widest - room,
        bottom: box.bottom - depth - room,
      };
      assertRoom(inner, chart.width, chart.height);
      const { center, radius } = fitSweep(inner, startAngle, endAngle, radiusAxis.innerRadius);
      frame = polarFrame(center, radius, radius * radiusAxis.innerRadius);
    }
    const { radius, hole } = frame;
    const radiusPlace: PolarScale =
      radiusAxis.type === 'linear'
        ? {
            type: 'linear',
            path: radiusAxis.path,
            scale: place(scaleOf(radiusAxis, endsOf(radiusAxis, extentOf('radius'), true), radius - hole), [
              hole,
              radius,
            ]),
          }
        : { type: 'band', path: radiusAxis.path, slot: ringsOf(radiusAxis.categories.length, hole, radius) };
    return { frame, radiusPlace };
  };
  // The radius axis' labels lie along the start of the sweep, wherever it points, so they can reach
  // past the box the rim's labels were fitted in. When they do, the box gives up what they overflow on
  // each side and the circle is fitted again: each round moves them in by at least half of what is
  // left, so a few rounds settle it. Labels that still do not fit are an error, never drawn off the
  // chart.
  let fitted = fitIn(rect);
  let box = rect;
  for (let round = 0; ; round++) {
    const over = overflowOf(drawing, startLabels(drawing, fitted.frame, fitted.radiusPlace, radiusAxis, startAngle), rect);
    if (!Object.values(over).some((by) => by > FIT_TOLERANCE)) {
      break;
    }
    if (round === MAX_REFITS) {
      fail('', `${aChart(chart.width, chart.height)} leaves no room for the labels of axes.radius`);
    }
    box = {
      left: box.left + over.left,
      top: box.top + over.top,
      right: box.right - over.right,
      bottom: box.bottom - over.bottom,
    };
    assertRoom(box, chart.width, chart.height);
    fitted = fitIn(box);
  }
  const { frame, radiusPlace } = fitted;
  const { radius, hole } = frame;

  const angle: PolarScale =
    angleAxis.type === 'linear'
      ? { type: 'linear', path: angleAxis.path, scale: place(angleScale!, [startAngle, endAngle]) }
      : {
          type: 'band',
          path: angleAxis.path,
          slot: bandAround(angleAxis.categories.length, startAngle, sweep, whole),
        };
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
      drawing.push(drawing.outline(shape, grid, ['grid', 'radius', tick]));
    }
  }
  // A visible band angle axis draws its spokes, a radar's web; a linear one only as gridlines.
  if (!angleAxis.hidden && (angleAxis.type === 'band' || angleAxis.grid)) {
    for (const spoke of spokes) {
      const [[x1, y1], [x2, y2]] = [frame.point(spoke.angle, hole), frame.point(spoke.angle, radius)];
      drawing.push(drawing.outline({ kind: 'line', x1, y1, x2, y2 }, grid, ['spoke', spoke.key]));
    }
  }

  const band = angleAxis.type === 'band' ? angleAxis : radiusAxis.type === 'band' ? radiusAxis : undefined;
  const slots = slotsOf(
    series.filter((entry) => polarMarkOf(entry).slot),
    (entry) => ('stack' in entry ? stackGroup(entry, 'polar') : `#${entry.index}`),
  );
  const context: PolarContext = {
    rect,
    drawing,
    frame,
    angle,
    radius: radiusPlace,
    categories: band?.categories ?? [],
    formats: {
      angle: angleAxis.type === 'linear' ? angleAxis.format : PLAIN_FORMAT,
      radius: radiusAxis.type === 'linear' ? radiusAxis.format : PLAIN_FORMAT,
    },
    slotCount: slots.count,
    whole,
    color: chart.color,
  };
  series.forEach((entry, i) => {
    const placed: PolarPlaced = { entry, spans: spans.get(entry) ?? [], slot: slots.slotOf(entry) };
    polarMarkOf(entry).draw(context, placed, paints[i]!);
  });

  for (const { text, ...position } of startLabels(drawing, frame, radiusPlace, radiusAxis, startAngle)) {
    drawing.push(drawing.text(text, position));
  }
  if (!angleAxis.hidden) {
    // A band axis labels every category; a linear one only the ticks whose labels do not overlap.
    const shown =
      angle.type === 'linear'
        ? new Set(labelledRim(angle.scale, spokes.length, radius + GAP, [widest + GAP, line + GAP / 2], whole))
        : undefined;
    spokes.forEach((spoke, i) => {
      if (shown?.has(i) ?? true) {
        const [px, py] = frame.point(spoke.angle, radius + GAP);
        drawing.push(drawing.text(spoke.label, { x: px, y: py, ...alignTowards(spoke.angle, true) }));
      }
    });
  }
}

interface StartLabel {
  text: string;
  x: number;
  y: number;
  anchor: TextAnchor;
  baseline: TextBaseline;
}

/**
 * The radius axis' labels along the start of the sweep: a linear axis' ticks beside the spoke, past
 * the hole, those that would overlap the one before left out, or a band axis' categories before it,
 * at their rings.
 */
function startLabels(
  drawing: Drawing,
  frame: PolarFrame,
  radius: PolarScale,
  axis: CheckedPolarChart['radius'],
  startAngle: number,
): StartLabel[] {
  if (axis.hidden) {
    return [];
  }
  if (radius.type === 'linear') {
    const { scale } = radius;
    // Labels along the spoke clear each other when they are a label's width apart across the chart
    // or a line apart down it.
    const [across, down] = onCircle(startAngle).map(Math.abs) as [number, number];
    const widest = Math.max(0, ...scale.labels.map((label) => drawing.width(label)));
    const room = Math.min((widest + GAP) / across, (drawing.lineHeight() + GAP / 2) / down);
    // The start is not labelled, so when it is all that thinning leaves, the outermost tick is.
    const past = scale.labelled(room, scale.at).filter((i) => scale.ticks[i]! > scale.domain[0]);
    const last = scale.ticks.length - 1;
    const shown = past.length > 0 || last < 0 || !(scale.ticks[last]! > scale.domain[0]) ? past : [last];
    return shown.map((i) => {
      const [px, py] = frame.point(startAngle, scale.at(scale.ticks[i]!));
      return { text: scale.labels[i]!, x: px + GAP / 2, y: py, anchor: 'start', baseline: 'middle' };
    });
  }
  const names = axis.type === 'band' ? axis.categories : [];
  return names.map((name, k) => {
    const [px, py] = frame.point(startAngle, radius.slot(k).middle);
    return { text: name, x: px - GAP / 2, y: py, anchor: 'end', baseline: 'middle' };
  });
}

/** How far `labels` reach past `box` on each side, or 0. */
function overflowOf(drawing: Drawing, labels: readonly StartLabel[], box: Rect): Record<keyof Rect, number> {
  return labels.reduce(
    (most, { text, x, y, anchor, baseline }) => {
      const reach = drawing.extent(text, { anchor, baseline });
      return {
        left: Math.max(most.left, box.left - (x - reach.left)),
        top: Math.max(most.top, box.top - (y - reach.up)),
        right: Math.max(most.right, x + reach.right - box.right),
        bottom: Math.max(most.bottom, y + reach.down - box.bottom),
      };
    },
    { left: 0, top: 0, right: 0, bottom: 0 },
  );
}

/** The data's extent on a value axis, or its emptyExtent, from 0 on a radius axis that sets no `min`. */
function endsOf(axis: CheckedLinearAxis, extent: [number, number] | undefined, fromZero = false): [number, number] {
  const [low, high] = extent ?? emptyExtent(axis);
  return [fromZero && axis.min === undefined ? 0 : low, high];
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
function slotsOf(
  series: readonly PolarSeries[],
  keyOf: (entry: PolarSeries) => string,
): { slotOf: (entry: PolarSeries) => number; count: number } {
  const keys = [...new Set(series.map(keyOf))];
  return { slotOf: (entry) => keys.indexOf(keyOf(entry)), count: keys.length };
}

/** A radar's outline through its values on the spokes, or a range radar's band between its pairs. */
function drawRadar(
  context: PolarContext,
  { entry }: PolarPlaced<Extract<PolarSeries, { type: 'radar' }>>,
  paint: Paint,
): void {
  const { drawing, frame, angle, radius } = context;
  const around = (values: readonly number[]): Point[] =>
    values.map((value, k) => frame.point(bandOf(angle)(k).middle, linearOf(radius).at(value)));
  const style = { ...hatched(paint), strokeWidth: LINE_WIDTH };
  const key = [entry.name, 'radar'];
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
  { entry, spans, slot }: PolarPlaced<Extract<PolarSeries, { type: 'rose' | 'radialBar' }>>,
  paint: Paint,
): void {
  const { drawing, frame, slotCount } = context;
  const [across, along, format] =
    entry.type === 'rose'
      ? [context.angle, context.radius, context.formats.radius]
      : [context.radius, context.angle, context.formats.angle];
  spans.forEach((span, i) => {
    const value = entry.data[i];
    if (!span || value === null || value === undefined || span[0] === span[1]) {
      return;
    }
    const { middle, half } = bandOf(across)(i);
    const width = (2 * half) / slotCount;
    const start = middle - half + slot * width;
    const [a, b] = [linearOf(along).at(span[0]), linearOf(along).at(span[1])];
    const [low, high] = [Math.min(a, b), Math.max(a, b)];
    const shape =
      entry.type === 'rose'
        ? sliceShape(frame.center, high, low, start, start + width)
        : sliceShape(frame.center, start + width, start, low, high);
    const category = context.categories[i]!;
    drawing.mark(`${entry.name}, ${category}: ${formatValue(value, format)}`, [
      drawing.shape(shape, hatched(paint), [entry.name, category, entry.type], entry.style),
    ]);
  });
}

function drawPolarLine(
  context: PolarContext,
  { entry }: PolarPlaced<Extract<PolarSeries, { type: 'polarLine' }>>,
  paint: Paint,
): void {
  const { drawing, frame, angle, radius } = context;
  const [slot, at] = [bandOf(angle), linearOf(radius).at];
  const points = entry.data.map((value, k) => (value === null ? null : frame.point(slot(k).middle, at(value))));
  const style = { stroke: paint.color, strokeWidth: LINE_WIDTH, ...(entry.dash ? { strokeLineDash: entry.dash } : {}) };
  drawing.mark(
    entry.name,
    polarRuns(points, context.whole).map((run, r) =>
      polyline(drawing, run, style, [entry.name, 'polarLine', r], entry.style),
    ),
  );
}

function drawPolarArea(
  context: PolarContext,
  { entry, spans }: PolarPlaced<Extract<PolarSeries, { type: 'polarArea' }>>,
  paint: Paint,
): void {
  const { drawing, frame, angle, radius } = context;
  const outline = { stroke: paint.color, strokeWidth: LINE_WIDTH };
  const [slot, at] = [bandOf(angle), linearOf(radius).at];
  const edges = spans.map((span, k) => {
    const a = slot(k).middle;
    return span && { from: frame.point(a, at(span[0])), to: frame.point(a, at(span[1])) };
  });
  const nodes = polarRuns(edges, context.whole).flatMap((run, r) => {
    const key = [entry.name, 'polarArea', r];
    const to = run.points.map((edge) => edge.to);
    if (to.length === 1) {
      return [polyline(drawing, { points: to, closed: false }, outline, key, entry.style)];
    }
    const from = run.points.map((edge) => edge.from);
    const fill: Shape = run.closed
      ? { kind: 'path', d: `${pathThrough(to)} Z ${pathThrough(from)} Z` }
      : { kind: 'polygon', points: [...to, ...from.reverse()] };
    return [
      drawing.shape(fill, { ...hatched(paint), stroke: 'none' }, [...key, 'fill'], entry.style),
      polyline(drawing, { points: to, closed: run.closed }, outline, [...key, 'high'], entry.style),
    ];
  });
  drawing.mark(entry.name, nodes);
}

function drawPolarPoints(
  context: PolarContext,
  { entry }: PolarPlaced<Extract<PolarSeries, { type: 'polarScatter' }>>,
  paint: Paint,
): void {
  const { drawing, frame, angle, radius, formats } = context;
  entry.data.forEach(([a, r], i) => {
    const [cx, cy] = frame.point(linearOf(angle).at(a), linearOf(radius).at(r));
    drawing.mark(`${entry.name}: ${formatValue(a, formats.angle)}, ${formatValue(r, formats.radius)}`, [
      markerNode(
        drawing, entry.symbol, [cx, cy], POINT_SIZE,
        solid(paint.color),
        [entry.name, i],
        entry.style,
      ),
      ...(entry.dataLabels ? [drawing.label(formatValue(r, formats.radius), cx, cy,
        context.rect, `${entry.path}.dataLabels`)] : []),
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
  key: SeedKey,
  own: SketchStyle,
): ChartNode {
  if (points.length === 1) {
    return loneDot(drawing, points[0]!, style.stroke, key, own);
  }
  const shape: Shape = closed ? { kind: 'polygon', points } : { kind: 'linearPath', points };
  return drawing.outline(shape, style, key, own);
}

function pathThrough(points: readonly Point[]): string {
  return points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${coordinate(px)} ${coordinate(py)}`).join(' ');
}

/**
 * Each cell in the colour of its value, a cell with no value as an outline only: an annular sector
 * across its angle category's share and its ring, or with `display: 'polygon'` the part of its ring
 * of polygons around its spoke, from halfway to the spoke before to halfway to the one after.
 */
function drawPolarHeatmap(
  { drawing, frame, angle, radius, whole, color, categories }: PolarContext,
  { entry }: PolarPlaced<Extract<PolarSeries, { type: 'polarHeatmap' }>>,
): void {
  const [slot, ring] = [bandOf(angle), bandOf(radius)];
  const scale = colorAxisOf(color, entry.path);
  entry.data.forEach((cell, i) => {
    const spoke = categoryIndex(cell.x);
    const { middle, half } = slot(spoke);
    const band = ring(categoryIndex(cell.y));
    const [inner, outer] = [band.middle - band.half, band.middle + band.half];
    let shape: Shape;
    if (entry.display === 'polygon') {
      // Around a whole turn the spoke before the first is the last; at the ends of part of one, the
      // cell stops at the edge of its share. The angle axis holds the categories.
      const count = categories.length;
      const vertex = (k: number, distance: number): Point => frame.point(slot(k).middle, distance);
      const side = (step: number, distance: number): Point => {
        const k = spoke + step;
        if (!whole && (k < 0 || k >= count)) return frame.point(middle + step * half, distance);
        const [a, b] = [vertex(spoke, distance), vertex((k + count) % count, distance)];
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      };
      shape = { kind: 'polygon', points: [side(-1, outer), vertex(spoke, outer), side(1, outer), side(1, inner), vertex(spoke, inner), side(-1, inner)] };
    } else {
      shape = sliceShape(frame.center, outer, inner, middle - half, middle + half);
    }
    const node = valueCell(drawing, shape, cell.value, scale, [entry.name, 'cell', i], entry.style);
    drawing.mark(valueTitle(entry.name, `${cell.given[0]}, ${cell.given[1]}`, cell.value, scale), [node]);
  });
}
