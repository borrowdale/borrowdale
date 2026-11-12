import { stackStatistics } from './statistics/stacks.js';
import { stackWeights } from './stack.js';
import { checkHistogramEdges, readHistogram } from './statistics/histogram.js';
import { displayKeys, DISTRIBUTIONS, MARKET_DISPLAYS, RELATIONSHIPS } from './statistics/types.js';
import { readDistribution } from './statistics/distribution.js';
import { readRelationship } from './statistics/relationship.js';
import { readMarket } from './statistics/market.js';
import { checkAnnotations, type CheckedAnnotation } from './annotations.js';
import { sketch, assertDrawable, type Seed, type SketchStyle } from '@borrowdale/core';
import { COLOR_RULE, isColor, MAX_PAINT, ownDash } from '@borrowdale/core/internal';
import { aSeries, hexColor, readEach } from './read.js';
import { excalifont, type Font } from '@borrowdale/text';
import {
  anyValue,
  CARTESIAN_KEYS,
  checkAngleAxis,
  checkAxis,
  checkContinuousAxis,
  checkLinearAxis,
  checkRadiusAxis,
  categoryOf,
  checkSweep,
  checkY2Axis,
  MAX_CATEGORIES,
  MAX_HOLE,
  MAX_NAME,
  readerOn,
  type CheckedAngleAxis,
  type CheckedAxis,
  type CheckedBandAxis,
  type CheckedLinearAxis,
  type CheckedRadiusAxis,
  type CheckedSweep,
} from './check-axis.js';
import {
  boolean,
  coordinate,
  coordinates,
  fail,
  fields,
  integer,
  list,
  MAX_POINTS,
  MAX_VALUE,
  nullable,
  number,
  oneOf,
  probe,
  SERIES_FIELDS,
  shortText,
  show,
  text,
  tuple,
  unique,
  type Check,
  type Fields,
} from './read.js';
import { checkCalendarChart, readCalendar } from './calendar-series.js';
import { readHeatmap, readHorizon, readPolarHeatmap, resolveCells, resolveHorizon, resolvePolarCells } from './cell-series.js';
import { withColorAxis } from './color-axis.js';
import type { ColorScale } from './color-scale.js';
import {
  CURVES,
  LEGEND_POSITIONS,
  SYMBOL_NAMES,
  type ChartSpec,
  type Marker,
  type LegendPosition,
  type SeriesType,
} from './types.js';

// Bounds on what a chart may ask for. The drawing work of everything within them is bounded again
// by one Budget for the whole chart (see drawing.ts).
const MAX_SIZE = 10_000;
const MAX_SERIES = 100;
const MAX_FONT_SIZE = 200;
// Every mark's seed starts with the chart seed, and hashing it is work the budget does not see.
const MAX_SEED = 100;
// A browser's work to paint a stroke grows with its width, and the budget does not see it.
const MAX_STROKE_WIDTH = 100;
// A needle's length, as a share of the radius.
const MIN_NEEDLE = 0.1;
const DEFAULT_NEEDLE = 0.8;
const MAX_BANDS = 100;

export type System = 'cartesian' | 'polar' | 'pie' | 'gauge' | 'timeline' | 'calendar';

type ReservePoints = (count: number) => void;
const categoryValues = (reserve: ReservePoints) =>
  list(0, MAX_POINTS, nullable(number(-MAX_VALUE, MAX_VALUE, 'or null')), reserve);
const valueAxis = oneOf(['y', 'y2'] as const);
const curve = oneOf(CURVES);

const color: Check<string> = (path, value) => {
  const given = text(MAX_PAINT)(path, value);
  if (!isColor(given)) {
    fail(path, `must be ${COLOR_RULE}, got ${show(given)}`);
  }
  return given;
};

// Each field a series type may have, read the same way by every type that has it, so a cartesian
// type and its polar twin take the same values, except that a polar chart's points are numbers only.
const readAxis = (r: Fields) => r.optional('axis', valueAxis) ?? 'y';
const readStack = (r: Fields) => r.optional('stack', text());
const readCurve = (r: Fields) => r.optional('curve', curve) ?? 'linear';
const checkMarker: Check<Marker> = (path, value) => {
  if (typeof value === 'string') return oneOf(SYMBOL_NAMES)(path, value);
  const r = fields(path, value);
  r.allow(['image']);
  return { image: r.required('image', text(MAX_NAME)) };
};
const readSymbol = (r: Fields) => r.optional('symbol', checkMarker) ?? 'circle';

/** A bar's shape, and the symbol a pictorial bar repeats, which only a pictorial bar takes. */
function readBar(r: Fields, path: string, reserve: ReservePoints) {
  const shape = r.optional('shape', oneOf(['rectangle', 'rounded', 'pyramid', 'pictorial'] as const)) ?? 'rectangle';
  const symbol = r.optional('symbol', checkMarker);
  const rest = { axis: readAxis(r), stack: readStack(r), data: readValues(r, reserve) };
  if (shape === 'pictorial') {
    return { ...rest, shape, symbol: symbol ?? fail(`${path}.symbol`, 'is missing: a pictorial bar repeats a symbol or an image') };
  }
  if (symbol !== undefined) fail(`${path}.symbol`, 'needs shape "pictorial"');
  return { ...rest, shape, symbol };
}
const readDash = (r: Fields) => r.optional('dash', checkDash);
const readValues = (r: Fields, reserve: ReservePoints) => r.required('data', categoryValues(reserve));
const readPoints =
  <const N extends readonly [string, string]>(names: N) =>
  (r: Fields, reserve: ReservePoints) =>
    r.required('data', list(0, MAX_POINTS, coordinates(names), reserve));
// A polar chart has no time axis, so its points are numbers.
const readPolarPoints = (r: Fields, reserve: ReservePoints) => r.required('data', list(0, MAX_POINTS, tuple(['angle', 'radius']), reserve));

/** What a series type needs of a polar chart. */
interface PolarNeeds {
  /** The kinds of the two axes. */
  angle: 'band' | 'linear';
  radius: 'band' | 'linear';
  /**
   * Whether its values on a linear radius grow out from 0, so none may be negative: `always`,
   * `stacked` (only once stacked), or `never` (below 0 only on a radius whose `min` is below it).
   */
  outward: 'always' | 'stacked' | 'never';
  /**
   * Draws a polygon through the spokes, so needs at least 3 categories; gridlines default to
   * polygons when every series does.
   */
  polygon: boolean;
}

/**
 * The axes a Cartesian series is drawn on: one band axis, two continuous axes of any kind, two
 * linear axes, for the statistical series whose geometry is computed in data units, a band y axis
 * across a continuous x axis, for horizon rows, or `any` of these and two band axes, for cells.
 */
type CartesianAxes = 'band' | 'continuous' | 'linear' | 'rows' | 'any';

const AXES_NEEDED: Record<CartesianAxes, string> = {
  band: 'one band axis',
  continuous: 'both axes continuous: linear, time, log or sqrt',
  linear: 'linear x and y axes',
  rows: 'a band y axis and a continuous x axis',
  any: 'x and y axes',
};

interface RuleBase {
  keys: readonly string[];
  read: (r: Fields, path: string, reserve: ReservePoints) => object;
}

type Rule =
  | (RuleBase & { system: 'cartesian'; axes: CartesianAxes })
  | (RuleBase & { system: 'polar'; band: boolean; polar: PolarNeeds })
  | (RuleBase & { system: Exclude<System, 'cartesian' | 'polar'> });

/**
 * What each series type needs: its coordinate system, the axes a Cartesian series is drawn on, or
 * whether a polar series is drawn per category of a band axis and which polar axes it needs, its
 * keys beyond the common ones, and how its own fields are read. `satisfies` makes a new type fail to
 * compile until it is listed, and `CheckedSeries` is derived from it.
 */
const SERIES_RULES = {
  bar: {
    system: 'cartesian',
    axes: 'band',
    keys: ['shape', 'symbol', 'dataLabels', 'axis', 'data', 'stack'],
    read: readBar,
  },
  line: {
    system: 'cartesian',
    axes: 'band',
    keys: ['symbol', 'dataLabels', 'axis', 'data', 'curve', 'dash'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ symbol: r.optional('symbol', checkMarker), axis: readAxis(r), curve: readCurve(r), dash: readDash(r), data: readValues(r, reserve) }),
  },
  area: {
    system: 'cartesian',
    axes: 'band',
    keys: ['axis', 'data', 'stack', 'curve'],
    // Whether the spec gave the curve: the check that a stack shares one names it only then.
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ axis: readAxis(r), stack: readStack(r), curve: readCurve(r), curveGiven: r.has('curve'), data: readValues(r, reserve) }),
  },
  rangeArea: {
    system: 'cartesian',
    axes: 'band',
    keys: ['axis', 'data', 'curve'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({
      axis: readAxis(r),
      curve: readCurve(r),
      data: r.required('data', list(0, MAX_POINTS, nullable(checkRange), reserve)),
    }),
  },
  interval: {
    system: 'cartesian',
    axes: 'band',
    keys: ['shape', 'dataLabels', 'axis', 'data', 'display', 'slotWidth', 'overlay', 'fromSymbol', 'toSymbol'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({
      shape: r.optional('shape', oneOf(['rectangle', 'rounded', 'pyramid'] as const)) ?? 'rectangle', axis: readAxis(r),
      data: r.required('data', list(0, MAX_POINTS, nullable(coordinates(['from', 'to'])), reserve)),
      display: r.optional('display', oneOf(['bar', 'line', 'error', 'point'] as const)) ?? 'bar',
      width: r.optional('slotWidth', number(0.05, 1)) ?? 0.8,
      overlay: r.optional('overlay', boolean) ?? false,
      fromSymbol: r.optional('fromSymbol', checkMarker),
      toSymbol: r.optional('toSymbol', checkMarker),
    }),
  },
  xRange: {
    system: 'cartesian',
    axes: 'band',
    keys: ['dataLabels', 'data', 'shape', 'slotWidth', 'overlay'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({
      data: r.required('data', list(0, MAX_POINTS, checkXRangeItem, reserve)),
      shape: r.optional('shape', oneOf(['rectangle', 'rounded'] as const)) ?? 'rectangle',
      width: r.optional('slotWidth', number(0.05, 1)) ?? 0.6,
      overlay: r.optional('overlay', boolean) ?? false,
    }),
  },
  distribution: { system: 'cartesian', axes: 'linear', keys: displayKeys(DISTRIBUTIONS), read: readDistribution },
  relationship: { system: 'cartesian', axes: 'linear', keys: displayKeys(RELATIONSHIPS), read: readRelationship },
  market: { system: 'cartesian', axes: 'linear', keys: displayKeys(MARKET_DISPLAYS), read: readMarket },
  histogram: { system: 'cartesian', axes: 'linear', keys: ['stack', 'edges', 'data', 'frequency', 'cumulative'], read: readHistogram },
  xyLine: {
    system: 'cartesian', axes: 'continuous',
    keys: ['dataLabels', 'data', 'symbol', 'dash', 'segments', 'widths', 'gradient'],
    read: (r: Fields, path: string, reserve: ReservePoints) => {
      const data = r.required('data', list(0, MAX_POINTS, nullable(coordinates(['x', 'y'])), reserve));
      const segments = r.optional('segments', list(Math.max(0, data.length - 1), Math.max(0, data.length - 1), nullable((p, raw) => {
        const segment = fields(p, raw);
        segment.allow(['color', 'strokeWidth', 'dash']);
        return { color: segment.optional('color', color), width: segment.optional('strokeWidth', number(0, 100)), dash: segment.optional('dash', checkDash) };
      })));
      const widths = r.optional('widths', list(data.length, data.length, number(0, 100)));
      const gradient = r.optional('gradient', (p, raw) => {
        const g = fields(p, raw); g.allow(['axis', 'stops']);
        const axis = g.required('axis', oneOf(['x', 'y'] as const));
        const stops = g.required('stops', list(2, 32, (p, raw) => {
          const stop = fields(p, raw); stop.allow(['offset', 'color']);
          return { offset: stop.required('offset', number(0, 1)), color: stop.required('color', hexColor) };
        }));
        if (stops[0]!.offset !== 0 || stops.at(-1)!.offset !== 1 || stops.some((stop, i) => i > 0 && stop.offset <= stops[i - 1]!.offset)) fail(p, 'needs increasing stops from 0 to 1');
        return { axis, stops };
      });
      if (segments && gradient) fail(path, 'cannot combine segments and gradient');
      if (segments && widths) fail(path, 'cannot combine segments and tapered widths');
      return { data, segments, widths, gradient, symbol: r.optional('symbol', checkMarker), dash: readDash(r) };
    },
  },
  xyArea: {
    system: 'cartesian',
    axes: 'continuous',
    keys: ['data', 'difference'],
    read: (r: Fields, path: string, reserve: ReservePoints) => {
      const difference = r.optional('difference', (p, raw) => {
        const d = fields(p, raw); d.allow(['positive', 'negative']);
        return { positive: d.required('positive', color), negative: d.required('negative', color) };
      });
      // Its order and bounds are checked once its values are read against the axes (resolveValues).
      const data = r.required('data', list(0, MAX_POINTS, nullable(coordinates(['x', 'low', 'high'])), reserve));
      return { data, difference };
    },
  },
  scatter: {
    system: 'cartesian',
    axes: 'continuous',
    keys: ['dataLabels', 'data', 'symbol'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ symbol: readSymbol(r), data: readPoints(['x', 'y'])(r, reserve) }),
  },
  bubble: {
    system: 'cartesian',
    axes: 'continuous',
    keys: ['dataLabels', 'data', 'symbol'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ symbol: readSymbol(r), data: r.required('data', list(0, MAX_POINTS, checkBubble, reserve)) }),
  },
  timeline: {
    system: 'timeline',
    keys: ['dataLabels', 'data'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({
      data: r.required('data', list(0, MAX_POINTS, checkTimelineEvent, reserve)),
    }),
  },
  pie: {
    system: 'pie',
    keys: ['dataLabels', 'data', 'innerRadius', 'outerRadius', 'startAngle', 'endAngle', 'padAngle', 'cornerRadius'],
    read: checkPieSeries,
  },
  radar: {
    system: 'polar',
    band: true,
    polar: { angle: 'band', radius: 'linear', outward: 'always', polygon: true },
    keys: ['data'],
    read: checkRadarData,
  },
  // The polar twins of bar, line, area and scatter: the same fields, read by the same readers, less
  // what a polar chart has no use for (a second value axis, curves, times).
  rose: {
    system: 'polar',
    band: true,
    polar: { angle: 'band', radius: 'linear', outward: 'always', polygon: false },
    keys: ['data', 'stack'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ stack: readStack(r), data: readValues(r, reserve) }),
  },
  radialBar: {
    system: 'polar',
    band: true,
    polar: { angle: 'linear', radius: 'band', outward: 'never', polygon: false },
    keys: ['data', 'stack'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ stack: readStack(r), data: readValues(r, reserve) }),
  },
  polarLine: {
    system: 'polar',
    band: true,
    polar: { angle: 'band', radius: 'linear', outward: 'never', polygon: false },
    keys: ['data', 'dash'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ dash: readDash(r), data: readValues(r, reserve) }),
  },
  polarArea: {
    system: 'polar',
    band: true,
    polar: { angle: 'band', radius: 'linear', outward: 'stacked', polygon: false },
    keys: ['data', 'stack'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ stack: readStack(r), data: readValues(r, reserve) }),
  },
  polarScatter: {
    system: 'polar',
    band: false,
    polar: { angle: 'linear', radius: 'linear', outward: 'never', polygon: false },
    keys: ['dataLabels', 'data', 'symbol'],
    read: (r: Fields, _path: string, reserve: ReservePoints) => ({ symbol: readSymbol(r), data: readPolarPoints(r, reserve) }),
  },
  heatmap: { system: 'cartesian', axes: 'any', keys: ['dataLabels', 'data', 'display', 'correlation'], read: readHeatmap },
  horizon: { system: 'cartesian', axes: 'rows', keys: ['row', 'data', 'layers', 'mode'], read: readHorizon },
  polarHeatmap: {
    system: 'polar',
    band: false,
    polar: { angle: 'band', radius: 'band', outward: 'never', polygon: false },
    keys: ['data', 'display'],
    read: readPolarHeatmap,
  },
  calendar: {
    system: 'calendar',
    keys: ['data', 'from', 'to', 'weekStart', 'orientation', 'format'],
    read: readCalendar,
  },
  gauge: {
    system: 'gauge',
    keys: ['value', 'display', 'needleLength'],
    read: (r: Fields) => ({
      value: r.required('value', anyValue),
      display: r.optional('display', oneOf(['needle', 'bar'] as const)) ?? 'needle',
      needleLength: r.optional('needleLength', number(MIN_NEEDLE, 1)) ?? DEFAULT_NEEDLE,
    }),
  },
} as const satisfies Record<SeriesType, Rule>;

type Rules = typeof SERIES_RULES;

/** Whether a series stacks: every type that stacks reads a `stack` field, set or not. */
export function isStacking<S extends CheckedSeries>(entry: S): entry is Extract<S, { stack: string | undefined }> {
  return 'stack' in entry;
}

// The types whose series stack, which are the ones a percent axis can show.
const STACKING = (Object.keys(SERIES_RULES) as SeriesType[])
  .filter((type) => {
    const rule: Rule = SERIES_RULES[type];
    return rule.system === 'cartesian' && rule.axes === 'band' && rule.keys.includes('stack');
  })
  .join(', ');

/** The fields every series has, checked. */
interface CheckedSeriesBase {
  dataLabels: boolean;
  /** Its position in `series`. */
  index: number;
  path: string;
  name: string;
  color: string | undefined;
  style: SketchStyle;
}

export type CheckedSeries = {
  [K in SeriesType]: CheckedSeriesBase & { type: K } & ReturnType<Rules[K]['read']>;
}[SeriesType];

/** The series types drawn in coordinate system `S`. */
export type SeriesOf<S extends System> = Extract<
  CheckedSeries,
  { type: { [K in SeriesType]: Rules[K]['system'] extends S ? K : never }[SeriesType] }
>;

export interface CheckedChartBase {
  width: number;
  height: number;
  title: string | undefined;
  seed: string;
  font: Font;
  fontSize: number;
  legend: LegendPosition | undefined;
  style: SketchStyle;
  /** The colour axis of a chart with series coloured by value. */
  color: ColorScale | undefined;
}

export interface CheckedCartesianChart extends CheckedChartBase {
  system: 'cartesian';
  annotations: CheckedAnnotation[];
  x: CheckedAxis;
  y: CheckedAxis;
  y2: CheckedLinearAxis | undefined;
  /** What each axis is for: a band axis and the value axes across it, two continuous axes, or cells. */
  roles: AxisRoles;
  series: SeriesOf<'cartesian'>[];
}

export interface CheckedPolarChart extends CheckedChartBase {
  system: 'polar';
  angle: CheckedAngleAxis;
  radius: CheckedRadiusAxis;
  series: SeriesOf<'polar'>[];
}

/** A pie series with its ring resolved: where it starts and ends, as shares of the radius. */
export type CheckedPie = SeriesOf<'pie'> & { innerRadius: number; outerRadius: number };

export interface CheckedPieChart extends CheckedChartBase {
  system: 'pie';
  /** Nested rings, the first outermost by default. */
  series: CheckedPie[];
}

export interface CheckedGaugeBand {
  from: number;
  to: number;
  color: string;
}

export interface CheckedGaugeChart extends CheckedChartBase {
  system: 'gauge';
  /** The dial. */
  angle: CheckedLinearAxis & CheckedSweep & { bands: CheckedGaugeBand[] };
  series: SeriesOf<'gauge'>[];
}

/** The track of a timeline, with its defaults filled in. */
type CheckedTimelinePath =
  | { type: 'line' }
  | { type: 'serpentine'; rows: number; rowsGiven: boolean }
  | { type: 'spiral'; turns: number; innerRadius: number }
  | { type: 'polyline'; points: [number, number][] };

export interface CheckedTimelineChart extends CheckedChartBase {
  system: 'timeline';
  axis: CheckedLinearAxis & { track: CheckedTimelinePath };
  series: SeriesOf<'timeline'>[];
}

export interface CheckedCalendarChart extends CheckedChartBase {
  system: 'calendar';
  series: SeriesOf<'calendar'>[];
}

/** A chart, checked: one shape per coordinate system, each with only its own axes and series. */
export type CheckedChart =
  | CheckedCartesianChart
  | CheckedPolarChart
  | CheckedPieChart
  | CheckedGaugeChart
  | CheckedTimelineChart
  | CheckedCalendarChart;

/**
 * Throws a named error, starting "Invalid chart:" and naming the place in the spec, for anything that
 * cannot be drawn. The spec is read once, here, through its own properties only, into plain arrays
 * and objects that the rest of the package can trust. The font is the caller's, not the spec's: like
 * all fonts, it is trusted.
 */
export function checkChart(spec: ChartSpec, font: Font = excalifont): CheckedChart {
  const r = fields('', spec);
  r.allow(['width', 'height', 'title', 'seed', 'fontSize', 'legend', 'style', 'axes', 'series', 'annotations', 'colorAxis']);
  const width = r.required('width', number(1, MAX_SIZE));
  const height = r.required('height', number(1, MAX_SIZE));
  const fontSize = r.optional('fontSize', number(1, MAX_FONT_SIZE)) ?? 12;
  const base: CheckedChartBase = {
    width,
    height,
    title: r.optional('title', text()),
    seed: String(r.optional('seed', checkSeed) ?? 1),
    font,
    fontSize,
    legend: r.optional('legend', oneOf(LEGEND_POSITIONS)),
    style: r.optional('style', checkStyle) ?? {},
    color: undefined,
  };
  let points = 0;
  const reserve = (count: number): void => {
    points += count;
    if (points > MAX_POINTS) {
      fail('series', `hold at least ${points} data points in all, more than ${MAX_POINTS}`);
    }
  };
  const series = r.required('series', list(1, MAX_SERIES, (path, raw, index) => checkSeries(path, raw, index, reserve)));
  unique(series.map((entry) => entry.name), (i) => `series[${i}].name`);
  // The first series decides the coordinate system; every other series must draw in it.
  const system = SERIES_RULES[series[0]!.type].system;
  if (system !== 'cartesian' && r.has('annotations')) fail('annotations', 'needs a Cartesian chart');
  return withColorAxis(r, checkSystem(r, base, series, system, reserve));
}

function checkSystem(r: Fields, base: CheckedChartBase, series: CheckedSeries[], system: System, reserve: ReservePoints): CheckedChart {
  switch (system) {
    case 'cartesian':
      return checkCartesianChart(r, base, seriesOf(series, 'cartesian'), reserve);
    case 'polar':
      return checkPolarChart(r, base, seriesOf(series, 'polar'));
    case 'pie':
      return checkPieChart(r, base, seriesOf(series, 'pie'));
    case 'gauge':
      return checkGaugeChart(r, base, seriesOf(series, 'gauge'));
    case 'timeline':
      return checkTimelineChart(r, base, seriesOf(series, 'timeline'));
    case 'calendar':
      return checkCalendarChart(r, base, seriesOf(series, 'calendar'));
  }
}

const TIMELINE_AXIS_KEYS = ['type', 'min', 'max', 'step', 'ticks', 'hidden', 'format', 'path'];
const TIMELINE_KEYS = { time: TIMELINE_AXIS_KEYS, linear: TIMELINE_AXIS_KEYS };
/** The most rows a serpentine track may have. */
export const MAX_ROWS = 20;
const MAX_TURNS = 20;
const MAX_TRACK_POINTS = 100;

const checkTimelineAxis = checkContinuousAxis(TIMELINE_KEYS, false, (r) => ({
  track: r.optional('path', checkTrack) ?? { type: 'line' as const },
}));

function checkTimelineChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'timeline'>[]): CheckedTimelineChart {
  const axes = r.optional('axes', fields);
  axes?.allow(['time']);
  const axis = axes?.optional('time', checkTimelineAxis) ?? checkTimelineAxis('axes.time', { type: 'time' });
  const value = readerOn(axis);
  for (const entry of series) {
    entry.data.forEach((event, i) => {
      const path = `${entry.path}.data[${i}]`;
      event.from = value(`${path}.from`, event.from);
      event.to = event.to === undefined ? undefined : value(`${path}.to`, event.to);
      if (event.to !== undefined && !(event.to > event.from)) {
        fail(`${path}.to`, 'must be after from; leave it out for a moment');
      }
    });
  }
  return { ...base, system: 'timeline', axis, series };
}

const checkTrack: Check<CheckedTimelinePath> = (path, raw) => {
  const r = fields(path, raw);
  const type = r.required('type', oneOf(['line', 'serpentine', 'spiral', 'polyline'] as const));
  switch (type) {
    case 'line':
      r.allow(['type']);
      return { type };
    case 'serpentine':
      r.allow(['type', 'rows']);
      // Whether the spec gave the rows: a room error names them only then.
      return { type, rows: r.optional('rows', integer(1, MAX_ROWS)) ?? 3, rowsGiven: r.has('rows') };
    case 'spiral':
      r.allow(['type', 'turns', 'innerRadius']);
      return { type, turns: r.optional('turns', number(1, MAX_TURNS)) ?? 3, innerRadius: r.optional('innerRadius', number(0, 0.9)) ?? 0.2 };
    case 'polyline':
      r.allow(['type', 'points']);
      return { type, points: r.required('points', list(2, MAX_TRACK_POINTS, (p, point) => {
        const [x, y] = tuple(['x', 'y'])(p, point);
        return [number(0, 1)(`${p}[0]`, x), number(0, 1)(`${p}[1]`, y)];
      })) };
  }
};

function checkSeries(path: string, raw: unknown, index: number, reserve: ReservePoints): CheckedSeries {
  const r = fields(path, raw);
  const type = r.required('type', checkSeriesType);
  const rule = SERIES_RULES[type];
  r.allow([...SERIES_FIELDS, ...rule.keys]);
  const base: CheckedSeriesBase = {
    dataLabels: r.optional('dataLabels', boolean) ?? false,
    index,
    path,
    name: r.required('name', text(MAX_NAME)),
    color: r.optional('color', color),
    style: r.optional('style', checkStyle) ?? {},
  };
  if (!rule.keys.some((key) => key === 'data')) {
    reserve(1);
  }
  // One cast: `rule.read`'s result matches `type` by construction of SERIES_RULES, which TypeScript
  // cannot follow through a lookup by a union key.
  return { ...base, type, ...rule.read(r, path, reserve) } as CheckedSeries;
}

const checkSeriesType: Check<SeriesType> = (path, type) => {
  if (typeof type !== 'string' || !Object.hasOwn(SERIES_RULES, type)) {
    fail(path, `must be a series type (${Object.keys(SERIES_RULES).join(', ')}), got ${show(type)}`);
  }
  return type as SeriesType;
};

function isIn<S extends System>(entry: CheckedSeries, system: S): entry is SeriesOf<S> {
  return SERIES_RULES[entry.type].system === system;
}

function seriesOf<S extends System>(series: readonly CheckedSeries[], system: S): SeriesOf<S>[] {
  const first = series[0]!.type;
  return series.map((entry) =>
    isIn(entry, system)
      ? entry
      : fail(entry.path, `is ${aSeries(entry.type)}, which cannot share a chart with series[0], ${aSeries(first)}`),
  );
}

function checkCartesianChart(
  r: Fields,
  base: CheckedChartBase,
  series: SeriesOf<'cartesian'>[],
  reserve: ReservePoints,
): CheckedCartesianChart {
  const axes = r.required('axes', fields);
  axes.allow(['x', 'y', 'y2']);
  // Where weights are "stacks", which the series' stacks turn into weights once they are checked.
  let stacksPath: string | undefined;
  const onStacks = (path: string): undefined => {
    stacksPath = path;
    return undefined;
  };
  const x = axes.required('x', checkAxis(CARTESIAN_KEYS, true, undefined, onStacks));
  const y = axes.required('y', checkAxis(CARTESIAN_KEYS, true, undefined, onStacks));
  const y2 = axes.optional('y2', checkY2Axis);
  const roles = rolesOf(x, y, y2, series);
  const band = roles.kind === 'band' ? roles.band : roles.kind === 'cells' ? roles.x : undefined;
  for (const linear of [x, y, y2]) {
    if (linear?.type === 'linear' && linear.percent && !band) {
      fail(`${linear.path}.percent`, `needs a band axis: only stacking series (${STACKING}) use it`);
    }
  }
  // The first area of each stack, by value axis and stack name.
  const stacked = new Map<string, Extract<SeriesOf<'cartesian'>, { type: 'area' }>>();
  for (const entry of series) {
    const { axes } = SERIES_RULES[entry.type];
    if (!fitsAxes(axes, roles)) fail(entry.path, `is ${aSeries(entry.type)}, which needs ${AXES_NEEDED[axes]}`);
    const onAxis = roles.kind === 'band' && valueAxisOf(entry, roles);
    if (onAxis && onAxis.percent && !isStacking(entry)) {
      const which = `a percent axis, which only stacking series (${STACKING}) can use`;
      fail(entry.path, `is ${aSeries(entry.type)} on ${onAxis.path}, ${which}`);
    }
    if (!('axis' in entry)) {
      continue;
    }
    if (band && entry.data.length !== band.categories.length) {
      const categories = `${band.path}.categories has ${band.categories.length}`;
      fail(`${entry.path}.data`, `has ${entry.data.length} values, but ${categories}`);
    }
    if (entry.type === 'area' && entry.stack !== undefined) {
      entry.data.forEach((point, i) => {
        if (point !== null && point < 0) {
          fail(`${entry.path}.data[${i}]`, `is negative, ${point}, which a stacked area cannot show`);
        }
      });
      // Each area of a stack starts at the edge of the one below, so they must share a curve.
      const first = stacked.get(`${entry.axis}|${entry.stack}`) ?? entry;
      if (first.curve !== entry.curve) {
        // Name the curve the spec gave, and say which is the default.
        const theirs = `${first.path}, in the same stack, ${first.curveGiven ? 'is' : 'has the default,'} ${first.curve}`;
        if (!entry.curveGiven) fail(entry.path, `has the default curve, ${entry.curve}, but ${theirs}`);
        fail(`${entry.path}.curve`, `is ${entry.curve}, but ${theirs}`);
      }
      stacked.set(`${entry.axis}|${entry.stack}`, first);
    }
  }
  if (stacksPath !== undefined) {
    const band = roles.kind === 'band' ? roles : fail(stacksPath, 'is "stacks", which needs bars on one band axis');
    band.band.weights = stackWeights(series, band.band, valueAxisOf(series[0]!, band), stacksPath);
  }
  resolveValues(series, roles, { x, y });
  // Histograms need linear x and y, so they are only ever on a continuous chart.
  if (roles.kind === 'continuous') checkHistogramEdges(series.filter((entry) => entry.type === 'histogram'), roles.x);
  stackStatistics(series, reserve);
  return { ...base, system: 'cartesian', x, y, y2, roles, series, annotations: checkAnnotations(r, { x, y, y2 }, color) };
}

/**
 * Reads every value of every series against the axis it is drawn on, once the axes are known: a
 * string as a time on a time axis, a number as milliseconds there, and on a log axis only a value the
 * axis can show. A series a kind of axis cannot draw is rejected. Values are replaced in place, in the
 * lists validation copied.
 */
function resolveValues(
  series: readonly SeriesOf<'cartesian'>[],
  roles: AxisRoles,
  axes: { x: CheckedAxis; y: CheckedAxis },
): void {
  for (const entry of series) {
    // Statistical series compute their geometry in linear data units: there is nothing to read.
    if (inDataUnits(entry)) continue;
    if (entry.type === 'heatmap') {
      resolveCells(entry, axes);
    } else if (entry.type === 'horizon' && roles.kind === 'band') {
      resolveHorizon(entry, roles.value, roles.band);
    } else if (entry.type === 'xRange' && roles.kind === 'band') {
      resolveXRange(entry, readerOn(roles.value), roles.band);
    } else if (entry.type !== 'xRange' && entry.type !== 'horizon' && !('axis' in entry) && roles.kind === 'continuous') {
      // Both axes are continuous: each coordinate is read by the axis it is on.
      const [x, y] = [readerOn(roles.x), readerOn(roles.y)];
      const readers = entry.type === 'bubble' ? [x, y, anyValue] : entry.type === 'xyArea' ? [x, y, y] : [x, y];
      readEach(entry.data, `${entry.path}.data`, readers);
      if (entry.type === 'xyArea') {
        checkArea(entry);
      }
    } else if ('axis' in entry && roles.kind === 'band') {
      resolveOnAxis(entry, valueAxisOf(entry, roles));
    } else {
      // Each other pairing of a series and the chart's axes was rejected before: a series here is
      // of a type this does not read, whose values would be left unread.
      throw new Error(`Unread chart values: ${entry.path}, ${aSeries(entry.type)}`);
    }
  }
}

/**
 * A cartesian chart's axes by role: a band axis and the value axes across it, two continuous axes,
 * or two band axes, which only cells can be drawn on.
 */
export type AxisRoles =
  /** `along` is the axis the bands are on: with `y`, bars run horizontally. */
  | { kind: 'band'; band: CheckedBandAxis; along: 'x' | 'y'; value: CheckedLinearAxis; y2: CheckedLinearAxis | undefined }
  | { kind: 'continuous'; x: CheckedLinearAxis; y: CheckedLinearAxis }
  | { kind: 'cells'; x: CheckedBandAxis; y: CheckedBandAxis };

function rolesOf(x: CheckedAxis, y: CheckedAxis, y2: CheckedLinearAxis | undefined, series: readonly SeriesOf<'cartesian'>[]): AxisRoles {
  if (x.type === 'band') {
    if (y.type === 'band') {
      const other = series.find((entry) => SERIES_RULES[entry.type].axes !== 'any');
      if (other) {
        fail('axes', `has two band axes, which only heatmap series can share, but ${other.path} is ${aSeries(other.type)}`);
      }
      if (y2) fail('axes.y2', 'needs y to be continuous');
      return { kind: 'cells', x, y };
    }
    return { kind: 'band', band: x, along: 'x', value: y, y2 };
  }
  if (y2) {
    fail('axes.y2', 'needs x to be the band axis');
  }
  return y.type === 'band' ? { kind: 'band', band: y, along: 'y', value: x, y2: undefined } : { kind: 'continuous', x, y };
}

/** The types whose geometry is computed in linear data units. */
type DataUnitType = { [T in keyof Rules]: Rules[T] extends { axes: 'linear' } ? T : never }[keyof Rules];

function inDataUnits(entry: SeriesOf<'cartesian'>): entry is Extract<SeriesOf<'cartesian'>, { type: DataUnitType }> {
  const rule: Rule = SERIES_RULES[entry.type];
  return rule.system === 'cartesian' && rule.axes === 'linear';
}

/** Whether a series that needs `axes` can be drawn on these. */
function fitsAxes(axes: CartesianAxes, roles: AxisRoles): boolean {
  switch (roles.kind) {
    case 'cells':
      return axes === 'any';
    case 'band':
      return axes === 'band' || axes === 'any' || (axes === 'rows' && roles.along === 'y');
    case 'continuous':
      return axes === 'continuous' || axes === 'any' || (axes === 'linear' && roles.x.kind === 'linear' && roles.y.kind === 'linear');
  }
}

// The axis a series on a band chart is drawn against: y2 when it says so, else the value axis. A
// series with no axis key (xRange) is on the value axis.
function valueAxisOf(entry: SeriesOf<'cartesian'>, roles: Extract<AxisRoles, { kind: 'band' }>): CheckedLinearAxis {
  if (!('axis' in entry) || entry.axis !== 'y2') {
    return roles.value;
  }
  return roles.y2 ?? fail(`${entry.path}.axis`, 'is y2, but the chart has no axes.y2');
}

// The values of a series drawn one per category against `axis`.
function resolveOnAxis(entry: Extract<SeriesOf<'cartesian'>, { axis: unknown }>, axis: CheckedLinearAxis): void {
  if (axis.kind === 'time' && entry.type !== 'interval') {
    fail(entry.path, `is ${aSeries(entry.type)} on ${axis.path}, a time axis, which only interval and xRange series can use`);
  }
  if (axis.kind === 'log' && (entry.type === 'bar' || entry.type === 'area')) {
    fail(entry.path, `is ${aSeries(entry.type)} on ${axis.path}, a log axis, which cannot show the 0 it stands on`);
  }
  const value = readerOn(axis);
  if (entry.type === 'interval' || entry.type === 'rangeArea') {
    readEach(entry.data, `${entry.path}.data`, [value, value]);
  } else {
    entry.data.forEach((point, i) => {
      if (point !== null) {
        value(`${entry.path}.data[${i}]`, point);
      }
    });
  }
}

// Each item's row among the band axis' categories, and its ends read by the value axis.
function resolveXRange(entry: Extract<SeriesOf<'cartesian'>, { type: 'xRange' }>, value: Check<number>, band: CheckedBandAxis): void {
  entry.data.forEach((item, i) => {
    const path = `${entry.path}.data[${i}]`;
    item.category = categoryOf(band, item.row, `${path}.row`);
    item.from = value(`${path}.from`, item.from);
    item.to = item.to === undefined ? undefined : value(`${path}.to`, item.to);
    if (item.to !== undefined && !(item.to > item.from)) {
      fail(`${path}.to`, 'must be after from; leave it out for a milestone');
    }
  });
}

// An xyArea's high value is not below its low one, unless it shows their difference, and x increases
// within each run.
function checkArea(entry: Extract<SeriesOf<'cartesian'>, { type: 'xyArea' }>): void {
  entry.data.forEach((point, i) => {
    if (point === null) return;
    if (!entry.difference && point[2] < point[1]) fail(`${entry.path}.data[${i}]`, 'has high below low');
    const previous = entry.data[i - 1];
    if (previous && point[0] <= previous[0]) fail(`${entry.path}.data[${i}][0]`, 'must increase within each run');
  });
}

function checkPolarChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'polar'>[]): CheckedPolarChart {
  const axes = r.required('axes', fields);
  axes.allow(['angle', 'radius']);
  const angle = axes.required('angle', checkAngleAxis);
  const { givenShape: shape, ...radiusAxis } =
    axes.optional('radius', checkRadiusAxis) ?? checkRadiusAxis('axes.radius', { type: 'linear' });
  for (const entry of series) {
    const needs = SERIES_RULES[entry.type].polar;
    for (const [key, axis] of [
      ['angle', angle],
      ['radius', radiusAxis],
    ] as const) {
      if (axis.type !== needs[key]) {
        // An axis left out is linear by default: say so rather than describe it as given.
        const is = axes.has(key) ? `is ${axis.type}` : `is left out, which makes it ${axis.type}`;
        fail(entry.path, `is ${aSeries(entry.type)}, which needs a ${needs[key]} ${key} axis, but axes.${key} ${is}`);
      }
    }
  }
  const radius: CheckedRadiusAxis = {
    ...radiusAxis,
    shape: shape ?? (series.every(isPolygon) ? 'polygon' : 'circle'),
  };
  if (radius.shape === 'polygon' && angle.type !== 'band') {
    fail('axes.radius.shape', 'is polygon, which needs a band angle axis for its corners');
  }
  if (radius.type === 'linear' && radius.min === undefined) {
    // Like a value below 0, a tick there would take the radius below where it starts.
    radius.ticks?.forEach(({ value }, i) => {
      if (value < 0) {
        fail(`${radius.path}.ticks[${i}]`, `is negative, ${value}, but axes.radius starts at 0 unless its min is set`);
      }
    });
  }
  const spokes = angle.type === 'band' ? angle.categories.length : 0;
  const polygonal = series.find(isPolygon);
  if (spokes < 3 && (polygonal || radius.shape === 'polygon')) {
    const what = polygonal ? `${polygonal.path}, ${aSeries(polygonal.type)}` : 'the polygon gridlines of axes.radius';
    fail('axes.angle.categories', `must have at least 3 categories for ${what}, got ${spokes}`);
  }
  const band = angle.type === 'band' ? angle : radius.type === 'band' ? radius : undefined;
  for (const entry of series) {
    if (entry.type === 'polarHeatmap') resolvePolarCells(entry, bandAxisOf(angle), bandAxisOf(radius));
  }
  for (const entry of series) {
    const rule = SERIES_RULES[entry.type];
    if (band && rule.band && entry.data.length !== band.categories.length) {
      const which = band === angle ? 'angle' : 'radius';
      fail(
        `${entry.path}.data`,
        `has ${entry.data.length} values, but axes.${which}.categories has ${band.categories.length}`,
      );
    }
    if (radius.type !== 'linear') {
      continue;
    }
    const stacked = isStacking(entry) && entry.stack !== undefined;
    const outward = rule.polar.outward === 'always' || (rule.polar.outward === 'stacked' && stacked);
    entry.data.forEach((item, i) => {
      // A point's radius, or a range's high value: a range's low is checked by its reader.
      const value = Array.isArray(item) ? item.at(-1) : item;
      if (typeof value === 'number' && value < 0 && (outward || radius.min === undefined)) {
        const at = Array.isArray(item) ? `${entry.path}.data[${i}][${item.length - 1}]` : `${entry.path}.data[${i}]`;
        const reason = outward
          ? `which ${stacked ? `a stacked ${entry.type} series` : aSeries(entry.type)} cannot show`
          : 'but axes.radius starts at 0 unless its min is set';
        fail(at, `is negative, ${value}, ${reason}`);
      }
    });
  }
  return { ...base, system: 'polar', angle, radius, series };
}

/**
 * Whether a polar series draws polygons through the spokes, so needs at least 3 categories: by its
 * type, or a polar heatmap by its `display`.
 */
function isPolygon(entry: SeriesOf<'polar'>): boolean {
  return SERIES_RULES[entry.type].polar.polygon || (entry.type === 'polarHeatmap' && entry.display === 'polygon');
}

// A polar axis a series' rule says is a band axis, as validation has made sure it is.
function bandAxisOf(axis: CheckedAngleAxis | CheckedRadiusAxis): CheckedBandAxis {
  if (axis.type !== 'band') throw new Error(`${axis.path} is a linear axis where a series needs a band one`);
  return axis;
}

const GAUGE_SWEEP: [number, number] = [-120, 120];
const DEFAULT_DIAL: [number, number] = [0, 100];
const GAUGE_KEYS = ['type', 'min', 'max', 'step', 'ticks', 'hidden', 'format', 'startAngle', 'endAngle', 'bands'];

function checkGaugeChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'gauge'>[]): CheckedGaugeChart {
  const axes = r.optional('axes', fields);
  axes?.allow(['angle']);
  const angle = axes
    ? axes.required('angle', checkDial)
    : checkDial('axes.angle', { type: 'linear', min: DEFAULT_DIAL[0], max: DEFAULT_DIAL[1] });
  for (const entry of axes ? [] : series) {
    if (!(entry.value >= DEFAULT_DIAL[0] && entry.value <= DEFAULT_DIAL[1])) {
      const dial = `the default dial, ${DEFAULT_DIAL[0]} to ${DEFAULT_DIAL[1]}; set axes.angle for another`;
      fail(`${entry.path}.value`, `is ${entry.value}, beyond ${dial}`);
    }
  }
  return { ...base, system: 'gauge', angle, series };
}

const checkDial = checkLinearAxis(GAUGE_KEYS, false, (r, path) => ({
  ...checkSweep(r, path, GAUGE_SWEEP),
  bands: checkGaugeBands(
    r.optional(
      'bands',
      list(0, MAX_BANDS, (path, value) => {
        const band = fields(path, value);
        band.allow(['from', 'to', 'color']);
        return {
          from: band.required('from', anyValue),
          to: band.required('to', anyValue),
          color: band.required('color', color),
        };
      }),
    ) ?? [],
  ),
}));

/** Gauge bands, each ending after it starts and none starting before the one before it ends. */
function checkGaugeBands(bands: CheckedGaugeBand[]): CheckedGaugeBand[] {
  bands.forEach((band, i) => {
    if (!(band.to > band.from)) {
      fail(`axes.angle.bands[${i}].to`, `must be greater than from (${band.from}), got ${band.to}`);
    }
    const before = bands[i - 1];
    if (before && band.from < before.to) {
      fail(
        `axes.angle.bands[${i}].from`,
        `is ${band.from}, before the end of axes.angle.bands[${i - 1}] (${before.to})`,
      );
    }
  });
  return bands;
}

const MAX_RINGS = 10;
const MAX_PAD_ANGLE = 10;
const MAX_CORNER_RADIUS = 1_000;
const MAX_OFFSET = 0.5;
const MIN_OUTER = 0.05;

function checkPieChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'pie'>[]): CheckedPieChart {
  if (r.has('axes')) {
    fail('axes', 'must be left out: a pie chart has no axes');
  }
  if (series.length > MAX_RINGS) {
    fail('series', `of a pie chart must be 1 to ${MAX_RINGS} pie series, got ${series.length}`);
  }
  const first = series[0]!;
  const count = series.length;
  const rings = series.map((pie, k) => {
    for (const key of ['startAngle', 'endAngle'] as const) {
      if (pie[key] !== first[key]) {
        // Name the angle the spec gave, and say which is the default.
        const theirs = first.sweepGiven[key] ? `${first.path}.${key} is ${first[key]}` : `${first.path} has the default, ${first[key]}`;
        if (!pie.sweepGiven[key]) fail(pie.path, `has the default ${key}, ${pie[key]}, but ${theirs}: nested rings share their sweep`);
        fail(`${pie.path}.${key}`, `is ${pie[key]}, but ${theirs}: nested rings share their sweep`);
      }
    }
    // Nested rings split the radius equally, the first outermost.
    const outerRadius = pie.outerRadius ?? 1 - k / count;
    const innerRadius = pie.innerRadius ?? (count === 1 ? 0 : 1 - (k + 1) / count);
    if (!(outerRadius > innerRadius)) {
      // Name the key the spec gave: a defaulted outerRadius is not the one to change.
      if (pie.outerRadius === undefined) {
        const limit = `must be less than the ring's default outerRadius (${outerRadius})`;
        fail(`${pie.path}.innerRadius`, `${limit}, got ${innerRadius}`);
      }
      const inner = pie.innerRadius === undefined ? `the ring's default innerRadius` : 'innerRadius';
      fail(`${pie.path}.outerRadius`, `must be greater than ${inner} (${innerRadius}), got ${outerRadius}`);
    }
    return { ...pie, innerRadius, outerRadius };
  });
  // A name in two rings is one legend entry with one colour.
  const colors = new Map<string, { color: string | undefined; path: string }>();
  for (const pie of rings) {
    pie.data.forEach((slice, i) => {
      const seen = colors.get(slice.name);
      if (seen && slice.color !== undefined && slice.color !== seen.color) {
        const given = seen.color === undefined ? 'none' : show(seen.color);
        fail(
          `${pie.path}.data[${i}].color`,
          `is ${show(slice.color)}, but ${seen.path}, of the same name, gives ${given}`,
        );
      }
      if (!seen) {
        colors.set(slice.name, { color: slice.color, path: `${pie.path}.data[${i}].color` });
      }
    });
  }
  return { ...base, system: 'pie', series: rings };
}

function checkPieSeries(r: Fields, path: string, reserve: ReservePoints) {
  const data = r.required(
    'data',
    list(1, MAX_CATEGORIES, (slicePath, raw) => {
      const slice = fields(slicePath, raw);
      slice.allow(['name', 'value', 'color', 'offset', 'radius']);
      return {
        name: slice.required('name', text(MAX_NAME)),
        value: slice.required('value', number(0, MAX_VALUE)),
        color: slice.optional('color', color),
        offset: slice.optional('offset', number(0, MAX_OFFSET)) ?? 0,
        radius: slice.optional('radius', number(0, MAX_VALUE)),
      };
    }, reserve),
  );
  unique(data.map((slice) => slice.name), (i) => `${path}.data[${i}].name`);
  if (!data.some((slice) => slice.value > 0)) {
    fail(`${path}.data`, 'has no value above 0, so there is nothing to draw');
  }
  const sized = data.filter((slice) => slice.radius !== undefined).length;
  if (sized > 0 && sized < data.length) {
    const i = data.findIndex((slice) => slice.radius === undefined);
    fail(`${path}.data[${i}].radius`, 'is missing: every slice has a radius, or none does');
  }
  // A slice is drawn only with a share of the pie and a reach beyond the hole.
  if (sized > 0 && !data.some((slice) => slice.value > 0 && (slice.radius ?? 0) > 0)) {
    fail(`${path}.data`, 'has no slice with both a value and a radius above 0, so there is nothing to draw');
  }
  const { startAngle, endAngle } = checkSweep(r, path);
  return {
    data,
    innerRadius: r.optional('innerRadius', number(0, MAX_HOLE)),
    outerRadius: r.optional('outerRadius', number(MIN_OUTER, 1)),
    startAngle,
    endAngle,
    // Which angles the spec gave: the check that nested rings share a sweep names only those.
    sweepGiven: { startAngle: r.has('startAngle'), endAngle: r.has('endAngle') },
    padAngle: r.optional('padAngle', number(0, MAX_PAD_ANGLE)) ?? 0,
    cornerRadius: r.optional('cornerRadius', number(0, MAX_CORNER_RADIUS)) ?? 0,
  };
}

// Checked by core itself, so charts accepts what `sketch` accepts, with colours and widths capped.
function checkStyle(path: string, raw: unknown): SketchStyle {
  fields(path, raw);
  // One copy, read once, is what is checked and what is drawn. An undefined entry is dropped rather
  // than copied: merged over the defaults, it would replace them.
  // The dash is copied too, by index, as core reads it.
  const style = Object.fromEntries(Object.entries(raw as object)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]): [string, unknown] => [key, key === 'strokeLineDash' ? ownDash(entry) : entry]));
  const r = fields(path, style);
  if (r.has('seed')) {
    fail(`${path}.seed`, 'is not allowed: each mark gets its own seed from the chart seed');
  }
  r.optional('stroke', color);
  r.optional('fill', color);
  r.optional('strokeWidth', number(0, MAX_STROKE_WIDTH));
  r.optional('fillWeight', number(0, MAX_STROKE_WIDTH));
  probe(path, () => sketch({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1 }, style));
  return style;
}

function checkDash(path: string, dash: unknown): number[] {
  // Copied by index first, as core reads it, so the copy checked is the copy drawn.
  const lengths = ownDash(dash) as number[];
  probe(path, () => assertDrawable({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1 }, { strokeLineDash: lengths }));
  return lengths;
}

/** A radar's values: a number per spoke, or a `[low, high]` pair per spoke for a range radar. */
function checkRadarData(r: Fields, path: string, reserve: ReservePoints): { data: number[] } | { data: [number, number][] } {
  const value = number(0, MAX_VALUE);
  const entry = (entryPath: string, raw: unknown): number | [number, number] =>
    Array.isArray(raw) ? checkRange(entryPath, raw) : value(entryPath, raw);
  const data = r.required('data', list(0, MAX_POINTS, entry, reserve));
  const ranges = data.filter((item): item is [number, number] => Array.isArray(item));
  const values = data.filter((item): item is number => !Array.isArray(item));
  if (ranges.length > 0 && values.length > 0) {
    const i = data.findIndex((item) => !Array.isArray(item));
    fail(`${path}.data[${i}]`, `is ${show(data[i])}: every value is a [low, high] pair, or none is`);
  }
  for (const [i, item] of data.entries()) {
    if (Array.isArray(item) && item[0] < 0) {
      fail(`${path}.data[${i}]`, `has a negative low value, ${item[0]}`);
    }
  }
  return ranges.length > 0 ? { data: ranges } : { data: values };
}

function checkRange(path: string, raw: unknown): [number, number] {
  const [low, high] = tuple(['low', 'high'])(path, raw);
  if (!(high >= low)) {
    fail(path, `has its high value below its low value, [${low}, ${high}]`);
  }
  return [low, high];
}

/** A timeline event; from and to are read once the axis is known (checkTimelineChart). */
interface CheckedTimelineEvent {
  from: number;
  to: number | undefined;
  label: string | undefined;
}

function checkTimelineEvent(path: string, raw: unknown): CheckedTimelineEvent {
  const r = fields(path, raw);
  r.allow(['from', 'to', 'label']);
  return { from: r.required('from', coordinate), to: r.optional('to', coordinate), label: r.optional('label', text(MAX_NAME)) };
}

/** An xRange item; its row is found, and from and to read, once the axes are known (resolveValues). */
interface CheckedXRangeItem {
  row: string;
  /** The index of its row among the band axis' categories. */
  category: number;
  from: number;
  to: number | undefined;
  label: string | undefined;
  progress: number | undefined;
}

function checkXRangeItem(path: string, raw: unknown): CheckedXRangeItem {
  const r = fields(path, raw);
  r.allow(['row', 'from', 'to', 'label', 'progress']);
  return {
    // Matched to a category, each measured as it was read, once the axes are known.
    row: r.required('row', shortText(MAX_NAME)),
    category: -1,
    from: r.required('from', coordinate),
    to: r.optional('to', coordinate),
    label: r.optional('label', text(MAX_NAME)),
    progress: r.optional('progress', number(0, 1)),
  };
}

function checkBubble(path: string, raw: unknown): [number, number, number] {
  const [x, y, size] = coordinates(['x', 'y', 'size'])(path, raw);
  anyValue(`${path}[2]`, size);
  if (size < 0) {
    fail(path, `has a negative size, ${size}`);
  }
  return [x, y, size];
}

function checkSeed(path: string, raw: unknown): Seed {
  const ok = typeof raw === 'string' ? raw.length <= MAX_SEED : typeof raw === 'number' && Number.isFinite(raw);
  if (!ok) {
    fail(path, `must be a finite number or a string of at most ${MAX_SEED} characters, got ${show(raw)}`);
  }
  return raw as Seed;
}
