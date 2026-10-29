import { sketch, type Seed, type SketchStyle } from '@borrowdale/core';
import { excalifont, type Font } from '@borrowdale/text';
import {
  boolean,
  fail,
  MAX_DECIMALS,
  MAX_VALUE,
  fields,
  integer,
  list,
  nullable,
  number,
  oneOf,
  probe,
  show,
  text,
  tuple,
  type Check,
  type Fields,
} from './read.js';
import { CURVES, LEGEND_POSITIONS, type ChartSpec, type LegendPosition, type SeriesType } from './types.js';

// Bounds on what a chart may ask for. The drawing work of everything within them is bounded again
// by one Budget for the whole chart (see drawing.ts).
const MAX_SIZE = 10_000;
const MAX_SERIES = 100;
const MAX_CATEGORIES = 1_000;
const MAX_POINTS = 100_000;
const MAX_FONT_SIZE = 200;
// For a number format's separators, prefix and suffix.
const MAX_FORMAT_TEXT = 10;
// Every mark writes its colours into the output: a long one would multiply the size of the drawing.
const MAX_COLOR = 100;
// So does every mark's tooltip, with its series and category names.
const MAX_NAME = 100;
// What every renderer paints alike: hex codes, names, rgb() and hsl(). Anything else, like a
// `url(…)`, would have an SVG fetch a file or paint with another part of the page.
const COLOR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|(?:rgba?|hsla?)\([\d .,%/+-]*\))$/i;
// Every mark's seed starts with the chart seed, and hashing it is work the budget does not see.
const MAX_SEED = 100;
// A browser's work to paint a stroke grows with its width, and the budget does not see it.
const MAX_STROKE_WIDTH = 100;
const LINEAR_KEYS = ['type', 'title', 'min', 'max', 'percent', 'grid', 'hidden', 'format'];

/**
 * Degrees by which a sweep may pass a whole turn, or fall short of it, through rounding and still be
 * one: 152.2 to 512.2 is 360.00000000000006 degrees.
 */
export const TURN_ROUNDING = 1e-9;

export type System = 'cartesian' | 'polar' | 'pie';

export interface CheckedFormat {
  /** Undefined means "from the tick step". */
  decimals: number | undefined;
  thousands: string;
  decimal: string;
  prefix: string;
  suffix: string;
}

export interface CheckedBandAxis {
  type: 'band';
  path: string;
  categories: string[];
  title: string | undefined;
  hidden: boolean;
}

export interface CheckedLinearAxis {
  type: 'linear';
  path: string;
  title: string | undefined;
  min: number | undefined;
  max: number | undefined;
  percent: boolean;
  grid: boolean;
  hidden: boolean;
  format: CheckedFormat;
}

export type CheckedAxis = CheckedBandAxis | CheckedLinearAxis;

const anyValue = number(-MAX_VALUE, MAX_VALUE);
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

/**
 * What each series type needs: its coordinate system, whether it is drawn per category of a band
 * axis, whether it stacks, its keys beyond the common ones, and how its own fields are read.
 * `satisfies` makes a new type fail to compile until it is listed, and `CheckedSeries` is derived
 * from it.
 */
const SERIES_RULES = {
  bar: {
    system: 'cartesian',
    band: true,
    stacks: true,
    keys: ['axis', 'data', 'stack'],
    read: (r: Fields) => ({
      axis: r.optional('axis', valueAxis) ?? 'y',
      stack: r.optional('stack', text()),
      data: r.required('data', categoryValues),
    }),
  },
  line: {
    system: 'cartesian',
    band: true,
    stacks: false,
    keys: ['axis', 'data', 'curve', 'dash'],
    read: (r: Fields) => ({
      axis: r.optional('axis', valueAxis) ?? 'y',
      curve: r.optional('curve', curve) ?? 'linear',
      dash: r.optional('dash', checkDash),
      data: r.required('data', categoryValues),
    }),
  },
  area: {
    system: 'cartesian',
    band: true,
    stacks: true,
    keys: ['axis', 'data', 'stack', 'curve'],
    read: (r: Fields) => ({
      axis: r.optional('axis', valueAxis) ?? 'y',
      stack: r.optional('stack', text()),
      curve: r.optional('curve', curve) ?? 'linear',
      data: r.required('data', categoryValues),
    }),
  },
  rangeArea: {
    system: 'cartesian',
    band: true,
    stacks: false,
    keys: ['axis', 'data', 'curve'],
    read: (r: Fields) => ({
      axis: r.optional('axis', valueAxis) ?? 'y',
      curve: r.optional('curve', curve) ?? 'linear',
      data: r.required('data', list(0, MAX_POINTS, nullable(checkRange))),
    }),
  },
  scatter: {
    system: 'cartesian',
    band: false,
    stacks: false,
    keys: ['data'],
    read: (r: Fields) => ({ data: r.required('data', list(0, MAX_POINTS, tuple(['x', 'y']))) }),
  },
  bubble: {
    system: 'cartesian',
    band: false,
    stacks: false,
    keys: ['data'],
    read: (r: Fields) => ({ data: r.required('data', list(0, MAX_POINTS, checkBubble)) }),
  },
  pie: {
    system: 'pie',
    band: false,
    stacks: false,
    keys: ['data', 'innerRadius', 'startAngle', 'endAngle'],
    read: checkPieSeries,
  },
  radar: {
    system: 'polar',
    band: false,
    stacks: false,
    keys: ['data'],
    read: (r: Fields) => ({ data: r.required('data', list(0, MAX_POINTS, number(0, MAX_VALUE))) }),
  },
} as const satisfies Record<
  SeriesType,
  { system: System; band: boolean; stacks: boolean; keys: readonly string[]; read: (r: Fields, path: string) => object }
>;

type Rules = typeof SERIES_RULES;

// The types whose series stack, which are the ones a percent axis can show.
const STACKING = (Object.keys(SERIES_RULES) as SeriesType[]).filter((type) => SERIES_RULES[type].stacks).join(', ');

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
  angle: CheckedBandAxis;
  radius: CheckedLinearAxis;
  series: SeriesOf<'polar'>[];
}

export interface CheckedPieChart extends CheckedChartBase {
  system: 'pie';
  series: [SeriesOf<'pie'>];
}

/** A chart, checked: one shape per coordinate system, each with only its own axes and series. */
export type CheckedChart = CheckedCartesianChart | CheckedPolarChart | CheckedPieChart;

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
  const series = r.required('series', list(1, MAX_SERIES, checkSeries));
  unique(series.map((entry) => entry.name), (i) => `series[${i}].name`);
  const points = series.reduce((sum, entry) => sum + entry.data.length, 0);
  if (points > MAX_POINTS) {
    fail('series', `hold ${points} data points in all, more than ${MAX_POINTS}`);
  }
  // The first series decides the coordinate system; every other series must draw in it.
  const system = SERIES_RULES[series[0]!.type].system;
  switch (system) {
    case 'cartesian':
      return checkCartesianChart(r, base, seriesOf(series, 'cartesian'));
    case 'polar':
      return checkPolarChart(r, base, seriesOf(series, 'polar'));
    case 'pie':
      return checkPieChart(r, base, seriesOf(series, 'pie'));
  }
}

function checkSeries(path: string, raw: unknown, index: number): CheckedSeries {
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
  // One cast: `rule.read`'s result matches `type` by construction of SERIES_RULES, which TypeScript
  // cannot follow through a lookup by a union key.
  return { ...base, type, ...rule.read(r, path) } as CheckedSeries;
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
  const x = axes.required('x', checkAxis(true));
  const y = axes.required('y', checkAxis(true));
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
    if (onAxis.type === 'linear' && onAxis.percent && !rule.stacks) {
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
  const angle = axes.required('angle', checkBandAxis(['type', 'categories', 'hidden']));
  const radiusAxis = checkLinearAxis(['type', 'min', 'max', 'grid', 'hidden', 'format'], true);
  const radius = axes.optional('radius', radiusAxis) ?? radiusAxis('axes.radius', { type: 'linear' });
  const spokes = angle.categories.length;
  if (spokes < 3) {
    fail('axes.angle.categories', `must have at least 3 categories for a radar chart, got ${spokes}`);
  }
  for (const entry of series) {
    if (entry.data.length !== spokes) {
      fail(`${entry.path}.data`, `has ${entry.data.length} values, but axes.angle.categories has ${spokes}`);
    }
  }
  return { ...base, system: 'polar', angle, radius, series };
}

function checkPieChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'pie'>[]): CheckedPieChart {
  if (r.has('axes')) {
    fail('axes', 'must be left out: a pie chart has no axes');
  }
  const [pie, ...others] = series;
  if (others.length > 0) {
    fail('series', `of a pie chart must be one pie series, got ${series.length} series`);
  }
  return { ...base, system: 'pie', series: [pie!] };
}

function checkPieSeries(r: Fields, path: string) {
  const data = r.required(
    'data',
    list(1, MAX_CATEGORIES, (slicePath, raw) => {
      const slice = fields(slicePath, raw);
      slice.allow(['name', 'value', 'color']);
      return {
        name: slice.required('name', text(MAX_NAME)),
        value: slice.required('value', number(0, MAX_VALUE)),
        color: slice.optional('color', color),
      };
    }),
  );
  unique(data.map((slice) => slice.name), (i) => `${path}.data[${i}].name`);
  if (!data.some((slice) => slice.value > 0)) {
    fail(`${path}.data`, 'has no value above 0, so there is nothing to draw');
  }
  const startAngle = r.optional('startAngle', number(-360, 360)) ?? 0;
  const endAngle = r.optional('endAngle', number(-360, 720)) ?? 360;
  if (!(endAngle > startAngle && endAngle - startAngle <= 360 + TURN_ROUNDING)) {
    const after = `greater than startAngle (${startAngle}) and at most 360 past it`;
    fail(`${path}.endAngle`, `must be ${after}, got ${endAngle}`);
  }
  return { data, innerRadius: r.optional('innerRadius', number(0, 0.95)) ?? 0, startAngle, endAngle };
}


/** An x or y axis, band or linear by its `type`. Gridlines of a linear one default to `grid`. */
function checkAxis(grid: boolean): Check<CheckedAxis> {
  return (path, raw) => {
    const type = fields(path, raw).required('type', (typePath, given) =>
      given === 'band' || given === 'linear' ? given : fail(typePath, `must be "band" or "linear", got ${show(given)}`),
    );
    return type === 'band'
      ? checkBandAxis(['type', 'categories', 'title', 'hidden'])(path, raw)
      : checkLinearAxis(LINEAR_KEYS, grid)(path, raw);
  };
}

function checkBandAxis(keys: readonly string[]): Check<CheckedBandAxis> {
  return (path, raw) => {
    const r = fields(path, raw);
    r.allow(keys);
    r.required('type', (typePath, given) =>
      given === 'band' ? given : fail(typePath, `must be "band", got ${show(given)}`),
    );
    const categories = r.required('categories', list(1, MAX_CATEGORIES, text(MAX_NAME)));
    unique(categories, (i) => `${path}.categories[${i}]`);
    const title = r.optional('title', text());
    return { type: 'band', path, categories, title, hidden: r.optional('hidden', boolean) ?? false };
  };
}

function checkLinearAxis(keys: readonly string[], grid: boolean): Check<CheckedLinearAxis> {
  return (path, raw) => {
    const r = fields(path, raw);
    r.allow(keys);
    r.required('type', (typePath, given) =>
      given === 'linear' ? given : fail(typePath, `must be "linear", got ${show(given)}`),
    );
    const min = r.optional('min', anyValue);
    const max = r.optional('max', anyValue);
    if (min !== undefined && max !== undefined && !(max > min)) {
      fail(`${path}.max`, `must be greater than min (${min}), got ${max}`);
    }
    const percent = r.optional('percent', boolean) ?? false;
    const format = r.optional('format', fields);
    format?.allow(['decimals', 'thousands', 'decimal', 'prefix', 'suffix']);
    const formatText = (key: string, fallback: string): string =>
      format?.optional(key, text(MAX_FORMAT_TEXT)) ?? fallback;
    return {
      type: 'linear',
      path,
      title: r.optional('title', text()),
      min,
      max,
      percent,
      grid: r.optional('grid', boolean) ?? grid,
      hidden: r.optional('hidden', boolean) ?? false,
      format: {
        decimals: format?.optional('decimals', integer(0, MAX_DECIMALS)),
        thousands: formatText('thousands', ','),
        decimal: formatText('decimal', '.'),
        prefix: formatText('prefix', ''),
        suffix: formatText('suffix', percent ? '%' : ''),
      },
    };
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

function unique(names: readonly string[], pathOf: (index: number) => string): void {
  const seen = new Set<string>();
  names.forEach((name, i) => {
    if (seen.has(name)) {
      fail(pathOf(i), `repeats ${show(name)}`);
    }
    seen.add(name);
  });
}
