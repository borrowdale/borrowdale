import { sketch, type Seed, type SketchStyle } from '@borrowdale/core';
import { excalifont, type Font } from '@borrowdale/text';
import {
  anyValue,
  CARTESIAN_KEYS,
  checkAngleAxis,
  checkAxis,
  checkLinearAxis,
  checkRadiusAxis,
  checkSweep,
  LINEAR_KEYS,
  MAX_CATEGORIES,
  MAX_HOLE,
  MAX_NAME,
  type CheckedAngleAxis,
  type CheckedAxis,
  type CheckedBandAxis,
  type CheckedLinearAxis,
  type CheckedRadiusAxis,
  type CheckedSweep,
} from './check-axis.js';
import {
  boolean,
  fail,
  MAX_VALUE,
  fields,
  list,
  nullable,
  number,
  oneOf,
  probe,
  show,
  text,
  tuple,
  unique,
  type Check,
  type Fields,
} from './read.js';
import { CURVES, LEGEND_POSITIONS, type ChartSpec, type LegendPosition, type SeriesType } from './types.js';

// Bounds on what a chart may ask for. The drawing work of everything within them is bounded again
// by one Budget for the whole chart (see drawing.ts).
const MAX_SIZE = 10_000;
const MAX_SERIES = 100;
const MAX_POINTS = 100_000;
const MAX_FONT_SIZE = 200;
// Every mark writes its colours into the output: a long one would multiply the size of the drawing.
const MAX_COLOR = 100;
// What every renderer paints alike: hex codes, names, rgb() and hsl(). Anything else, like a
// `url(…)`, would have an SVG fetch a file or paint with another part of the page.
const COLOR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|(?:rgba?|hsla?)\([\d .,%/+-]*\))$/i;
// Every mark's seed starts with the chart seed, and hashing it is work the budget does not see.
const MAX_SEED = 100;
// A browser's work to paint a stroke grows with its width, and the budget does not see it.
const MAX_STROKE_WIDTH = 100;
// A needle's length, as a share of the radius.
const MIN_NEEDLE = 0.1;
const DEFAULT_NEEDLE = 0.8;
const MAX_BANDS = 100;

export type System = 'cartesian' | 'polar' | 'pie' | 'gauge';

const categoryValues = list(0, MAX_POINTS, nullable(number(-MAX_VALUE, MAX_VALUE, 'or null')));
const valueAxis = oneOf(['y', 'y2'] as const);
const curve = oneOf(CURVES);

const color: Check<string> = (path, value) => {
  const given = text(MAX_COLOR)(path, value);
  if (!COLOR.test(given)) {
    fail(path, `must be a colour (a hex code, a name, rgb() or hsl()), got ${show(given)}`);
  }
  return given;
};

// Each field a series type may have, read the same way by every type that has it, so a cartesian
// type and its polar twin take the same values.
const readAxis = (r: Fields) => r.optional('axis', valueAxis) ?? 'y';
const readStack = (r: Fields) => r.optional('stack', text());
const readCurve = (r: Fields) => r.optional('curve', curve) ?? 'linear';
const readDash = (r: Fields) => r.optional('dash', checkDash);
const readValues = (r: Fields) => r.required('data', categoryValues);
const readPoints =
  <const N extends readonly [string, string]>(names: N) =>
  (r: Fields) =>
    r.required('data', list(0, MAX_POINTS, tuple(names)));

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
 * What each series type needs: its coordinate system, whether it is drawn per category of a band
 * axis, whether it stacks, which polar axes it needs, its keys beyond the common ones, and how its own
 * fields are read. `satisfies` makes a new type fail to compile until it is listed, and
 * `CheckedSeries` is derived from it.
 */
const SERIES_RULES = {
  bar: {
    system: 'cartesian',
    band: true,
    keys: ['axis', 'data', 'stack'],
    read: (r: Fields) => ({ axis: readAxis(r), stack: readStack(r), data: readValues(r) }),
  },
  line: {
    system: 'cartesian',
    band: true,
    keys: ['axis', 'data', 'curve', 'dash'],
    read: (r: Fields) => ({ axis: readAxis(r), curve: readCurve(r), dash: readDash(r), data: readValues(r) }),
  },
  area: {
    system: 'cartesian',
    band: true,
    keys: ['axis', 'data', 'stack', 'curve'],
    read: (r: Fields) => ({ axis: readAxis(r), stack: readStack(r), curve: readCurve(r), data: readValues(r) }),
  },
  rangeArea: {
    system: 'cartesian',
    band: true,
    keys: ['axis', 'data', 'curve'],
    read: (r: Fields) => ({
      axis: readAxis(r),
      curve: readCurve(r),
      data: r.required('data', list(0, MAX_POINTS, nullable(checkRange))),
    }),
  },
  scatter: {
    system: 'cartesian',
    band: false,
    keys: ['data'],
    read: (r: Fields) => ({ data: readPoints(['x', 'y'])(r) }),
  },
  bubble: {
    system: 'cartesian',
    band: false,
    keys: ['data'],
    read: (r: Fields) => ({ data: r.required('data', list(0, MAX_POINTS, checkBubble)) }),
  },
  pie: {
    system: 'pie',
    band: false,
    keys: ['data', 'innerRadius', 'outerRadius', 'startAngle', 'endAngle', 'padAngle', 'cornerRadius'],
    read: checkPieSeries,
  },
  radar: {
    system: 'polar',
    band: true,
    polar: { angle: 'band', radius: 'linear', outward: 'always', polygon: true },
    keys: ['data'],
    read: (r: Fields, path: string) => checkRadarData(r, path),
  },
  // The polar twins of bar, line, area and scatter: the same fields, read by the same readers, less
  // what a polar chart has no use for (a second value axis, curves).
  rose: {
    system: 'polar',
    band: true,
    polar: { angle: 'band', radius: 'linear', outward: 'always', polygon: false },
    keys: ['data', 'stack'],
    read: (r: Fields) => ({ stack: readStack(r), data: readValues(r) }),
  },
  radialBar: {
    system: 'polar',
    band: true,
    polar: { angle: 'linear', radius: 'band', outward: 'never', polygon: false },
    keys: ['data', 'stack'],
    read: (r: Fields) => ({ stack: readStack(r), data: readValues(r) }),
  },
  polarLine: {
    system: 'polar',
    band: true,
    polar: { angle: 'band', radius: 'linear', outward: 'never', polygon: false },
    keys: ['data', 'dash'],
    read: (r: Fields) => ({ dash: readDash(r), data: readValues(r) }),
  },
  polarArea: {
    system: 'polar',
    band: true,
    polar: { angle: 'band', radius: 'linear', outward: 'stacked', polygon: false },
    keys: ['data', 'stack'],
    read: (r: Fields) => ({ stack: readStack(r), data: readValues(r) }),
  },
  polarScatter: {
    system: 'polar',
    band: false,
    polar: { angle: 'linear', radius: 'linear', outward: 'never', polygon: false },
    keys: ['data'],
    read: (r: Fields) => ({ data: readPoints(['angle', 'radius'])(r) }),
  },
  gauge: {
    system: 'gauge',
    band: false,
    keys: ['value', 'display', 'length'],
    read: (r: Fields) => ({
      value: r.required('value', anyValue),
      display: r.optional('display', oneOf(['needle', 'bar'] as const)) ?? 'needle',
      length: r.optional('length', number(MIN_NEEDLE, 1)) ?? DEFAULT_NEEDLE,
    }),
  },
} as const satisfies Record<
  SeriesType,
  {
    system: System;
    band: boolean;
    polar?: PolarNeeds;
    keys: readonly string[];
    read: (r: Fields, path: string) => object;
  }
>;

type Rules = typeof SERIES_RULES;

/** Whether a series stacks: every type that stacks reads a `stack` field, set or not. */
export function isStacking<S extends CheckedSeries>(entry: S): entry is Extract<S, { stack: string | undefined }> {
  return 'stack' in entry;
}

// The types whose series stack, which are the ones a percent axis can show.
const STACKING = (Object.keys(SERIES_RULES) as SeriesType[])
  .filter((type) => SERIES_RULES[type].system === 'cartesian' && SERIES_RULES[type].keys.some((key) => key === 'stack'))
  .join(', ');

/** The fields every series has, checked. */
interface CheckedSeriesBase {
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

interface CheckedChartBase {
  width: number;
  height: number;
  title: string | undefined;
  seed: string;
  font: Font;
  fontSize: number;
  legend: LegendPosition | undefined;
  style: SketchStyle;
}

export interface CheckedCartesianChart extends CheckedChartBase {
  system: 'cartesian';
  x: CheckedAxis;
  y: CheckedAxis;
  y2: CheckedLinearAxis | undefined;
  /** The axis the categories are on, if one is; with `y`, bars run horizontally. */
  band: CheckedBandAxis | undefined;
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

/** A chart, checked: one shape per coordinate system, each with only its own axes and series. */
export type CheckedChart = CheckedCartesianChart | CheckedPolarChart | CheckedPieChart | CheckedGaugeChart;

/**
 * Throws a named error, starting "Invalid chart:" and naming the place in the spec, for anything that
 * cannot be drawn. The spec is read once, here, through its own properties only, into plain arrays
 * and objects that the rest of the package can trust. The font is the caller's, not the spec's: like
 * all fonts, it is trusted.
 */
export function checkChart(spec: ChartSpec, font: Font = excalifont): CheckedChart {
  const r = fields('', spec);
  r.allow(['width', 'height', 'title', 'seed', 'fontSize', 'legend', 'style', 'axes', 'series']);
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
  switch (system) {
    case 'cartesian':
      return checkCartesianChart(r, base, seriesOf(series, 'cartesian'));
    case 'polar':
      return checkPolarChart(r, base, seriesOf(series, 'polar'));
    case 'pie':
      return checkPieChart(r, base, seriesOf(series, 'pie'));
    case 'gauge':
      return checkGaugeChart(r, base, seriesOf(series, 'gauge'));
  }
}

function checkSeries(path: string, raw: unknown, index: number, reserve: (count: number) => void): CheckedSeries {
  const r = fields(path, raw);
  const type = r.required('type', checkSeriesType);
  const rule = SERIES_RULES[type];
  r.allow(['type', 'name', 'color', 'style', ...rule.keys]);
  const base: CheckedSeriesBase = {
    index,
    path,
    name: r.required('name', text(MAX_NAME)),
    color: r.optional('color', color),
    style: r.optional('style', checkStyle) ?? {},
  };
  // Charge each data array before its reader copies any entries. Keep the same field read for
  // charging and validation: a getter must not substitute a different array between them.
  const dataFields: Fields = {
    ...r,
    required: (key, check) => r.required(key, (fieldPath, value) => {
      if (key === 'data' && Array.isArray(value) && value.length <= MAX_POINTS) {
        reserve(value.length);
      }
      return check(fieldPath, value);
    }),
  };
  if (!rule.keys.some((key) => key === 'data')) {
    reserve(1);
  }
  // One cast: `rule.read`'s result matches `type` by construction of SERIES_RULES, which TypeScript
  // cannot follow through a lookup by a union key.
  return { ...base, type, ...rule.read(dataFields, path) } as CheckedSeries;
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
      : fail(entry.path, `is a ${entry.type} series, which cannot share a chart with series[0], a ${first} series`),
  );
}

function checkCartesianChart(
  r: Fields,
  base: CheckedChartBase,
  series: SeriesOf<'cartesian'>[],
): CheckedCartesianChart {
  const axes = r.required('axes', fields);
  axes.allow(['x', 'y', 'y2']);
  const x = axes.required('x', checkAxis(CARTESIAN_KEYS, true));
  const y = axes.required('y', checkAxis(CARTESIAN_KEYS, true));
  const y2 = axes.optional('y2', checkLinearAxis(LINEAR_KEYS, false));
  if (x.type === 'band' && y.type === 'band') {
    fail('axes', 'has two band axes; one of x and y must be linear');
  }
  const band = x.type === 'band' ? x : y.type === 'band' ? y : undefined;
  if (y2 && x.type !== 'band') {
    fail('axes.y2', 'needs x to be the band axis');
  }
  for (const linear of [x, y, y2]) {
    if (linear?.type === 'linear' && linear.percent && !band) {
      fail(`${linear.path}.percent`, `needs a band axis: only stacking series (${STACKING}) use it`);
    }
  }
  // The first area of each stack, by value axis and stack name.
  const stacked = new Map<string, Extract<SeriesOf<'cartesian'>, { type: 'area' }>>();
  for (const entry of series) {
    const rule = SERIES_RULES[entry.type];
    if (rule.band && !band) {
      fail(entry.path, `is a ${entry.type} series, which needs one band axis`);
    }
    if (!rule.band && band) {
      fail(entry.path, `is a ${entry.type} series, which needs both axes linear`);
    }
    if (!('axis' in entry)) {
      continue;
    }
    if (entry.axis === 'y2' && !y2) {
      fail(`${entry.path}.axis`, 'is y2, but the chart has no axes.y2');
    }
    if (band && entry.data.length !== band.categories.length) {
      const categories = `${band.path}.categories has ${band.categories.length}`;
      fail(`${entry.path}.data`, `has ${entry.data.length} values, but ${categories}`);
    }
    const onAxis = entry.axis === 'y2' ? y2! : band === x ? y : x;
    if (onAxis.type === 'linear' && onAxis.percent && !isStacking(entry)) {
      const which = `a percent axis, which only stacking series (${STACKING}) can use`;
      fail(entry.path, `is a ${entry.type} series on ${onAxis.path}, ${which}`);
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
        fail(`${entry.path}.curve`, `is ${entry.curve}, but ${first.path}, in the same stack, is ${first.curve}`);
      }
      stacked.set(`${entry.axis}|${entry.stack}`, first);
    }
  }
  return { ...base, system: 'cartesian', x, y, y2, band, series };
}

function checkPolarChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'polar'>[]): CheckedPolarChart {
  const axes = r.required('axes', fields);
  axes.allow(['angle', 'radius']);
  const angle = axes.required('angle', checkAngleAxis);
  const { shapeGiven: shape, ...radiusAxis } =
    axes.optional('radius', checkRadiusAxis) ?? checkRadiusAxis('axes.radius', { type: 'linear' });
  for (const entry of series) {
    const needs = SERIES_RULES[entry.type].polar;
    for (const [key, axis] of [
      ['angle', angle],
      ['radius', radiusAxis],
    ] as const) {
      if (axis.type !== needs[key]) {
        fail(
          entry.path,
          `is a ${entry.type} series, which needs a ${needs[key]} ${key} axis, but axes.${key} is ${axis.type}`,
        );
      }
    }
  }
  const radius: CheckedRadiusAxis = {
    ...radiusAxis,
    shape: shape ?? (series.every((entry) => SERIES_RULES[entry.type].polar.polygon) ? 'polygon' : 'circle'),
  };
  if (radius.shape === 'polygon' && angle.type !== 'band') {
    fail('axes.radius.shape', 'is polygon, which needs a band angle axis for its corners');
  }
  const spokes = angle.type === 'band' ? angle.categories.length : 0;
  const polygonal = series.find((entry) => SERIES_RULES[entry.type].polar.polygon);
  if (spokes < 3 && (polygonal || radius.shape === 'polygon')) {
    const what = polygonal ? `${polygonal.path}, a ${polygonal.type} series` : 'the polygon gridlines of axes.radius';
    fail('axes.angle.categories', `must have at least 3 categories for ${what}, got ${spokes}`);
  }
  const band = angle.type === 'band' ? angle : radius.type === 'band' ? radius : undefined;
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
          ? `which a ${stacked ? 'stacked ' : ''}${entry.type} series cannot show`
          : 'but axes.radius starts at 0 unless its min is set';
        fail(at, `is negative, ${value}, ${reason}`);
      }
    });
  }
  return { ...base, system: 'polar', angle, radius, series };
}

const GAUGE_SWEEP: [number, number] = [-120, 120];
const DEFAULT_DIAL: [number, number] = [0, 100];
const GAUGE_KEYS = ['type', 'min', 'max', 'hidden', 'format', 'startAngle', 'endAngle', 'bands'];

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
        fail(
          `${pie.path}.${key}`,
          `is ${pie[key]}, but series[0].${key} is ${first[key]}: nested rings share their sweep`,
        );
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
      fail(`${pie.path}.outerRadius`, `must be greater than innerRadius (${innerRadius}), got ${outerRadius}`);
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

function checkPieSeries(r: Fields, path: string) {
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
    }),
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
    padAngle: r.optional('padAngle', number(0, MAX_PAD_ANGLE)) ?? 0,
    cornerRadius: r.optional('cornerRadius', number(0, MAX_CORNER_RADIUS)) ?? 0,
  };
}

// Checked by core itself, so charts accepts what `sketch` accepts, with colours and widths capped.
function checkStyle(path: string, raw: unknown): SketchStyle {
  fields(path, raw);
  // One copy, read once, is what is checked and what is drawn. An undefined entry is dropped rather
  // than copied: merged over the defaults, it would replace them.
  const style = Object.fromEntries(Object.entries(raw as object).filter(([, entry]) => entry !== undefined));
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
  probe(path, () => sketch({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1 }, { strokeLineDash: dash as number[] }));
  // Copied by index, as core's check read it.
  const lengths = dash as number[];
  return Array.from({ length: lengths.length }, (_, i) => lengths[i]!);
}

/** A radar's values: a number per spoke, or a `[low, high]` pair per spoke for a range radar. */
function checkRadarData(r: Fields, path: string): { data: number[] } | { data: [number, number][] } {
  const value = number(0, MAX_VALUE);
  const entry = (entryPath: string, raw: unknown): number | [number, number] =>
    Array.isArray(raw) ? checkRange(entryPath, raw) : value(entryPath, raw);
  const data = r.required('data', list(0, MAX_POINTS, entry));
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

function checkBubble(path: string, raw: unknown): [number, number, number] {
  const [x, y, size] = tuple(['x', 'y', 'size'])(path, raw);
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

