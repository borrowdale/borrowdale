// Reading the axes of a chart spec: band axes and the continuous ones (linear, log, square-root and
// time), their formats and sweeps, and the keys each coordinate system allows on them. Independent
// of series, which validate.ts reads.
import { decimalsOf } from './decimals.js';
import {
  boolean,
  bound,
  fail,
  fields,
  integer,
  list,
  MAX_DECIMALS,
  MAX_TICKS,
  MAX_VALUE,
  number,
  oneOf,
  show,
  text,
  unique,
  type Check,
  type Fields,
} from './read.js';
import { ENGLISH_MONTHS, interval, time, writtenOn, type TimeInterval } from './time.js';
import { TIME_UNITS } from './types.js';

export const MAX_CATEGORIES = 1_000;
// Every mark's tooltip repeats its series and category names, so a long one multiplies the size of
// the drawing.
export const MAX_NAME = 100;
// For a number format's separators, prefix and suffix.
const MAX_FORMAT_TEXT = 10;
// For the name of a month on a time axis.
const MAX_MONTH = 20;

const LINEAR_KEYS = ['type', 'title', 'min', 'max', 'step', 'ticks', 'percent', 'grid', 'hidden', 'format', 'labelAngle'];
const SQRT_KEYS = ['type', 'title', 'min', 'max', 'step', 'ticks', 'grid', 'hidden', 'format', 'labelAngle'];
const LOG_KEYS = ['type', 'title', 'min', 'max', 'ticks', 'grid', 'hidden', 'format', 'labelAngle'];
const TIME_KEYS = ['type', 'title', 'min', 'max', 'step', 'ticks', 'grid', 'hidden', 'format', 'labelAngle'];
const MAX_LABEL_ANGLE = 90;
/** The smallest value a log axis shows: its ticks are written down to this power of ten. */
const MIN_LOG = 1e-20;
// The most of a time unit one step of a time axis may take.
const MAX_EVERY = 1_000;
// The largest hole in a radius axis or a pie, as a share of the radius.
export const MAX_HOLE = 0.95;

/**
 * Degrees by which a sweep may pass a whole turn, or fall short of it, through rounding and still be
 * one: 152.2 to 512.2 is 360.00000000000006 degrees.
 */
export const TURN_ROUNDING = 1e-9;

export interface CheckedFormat {
  /** Undefined means "from the tick step". */
  decimals: number | undefined;
  thousandsSeparator: string;
  decimalSeparator: string;
  prefix: string;
  suffix: string;
}

export interface CheckedBandAxis {
  type: 'band';
  path: string;
  categories: string[];
  weights?: number[] | undefined;
  title: string | undefined;
  hidden: boolean;
  /** 0 on an axis that cannot rotate its labels. */
  labelAngle: number;
}

/** A tick given in an axis' `ticks`, with the label it has instead of its formatted value. */
export interface CheckedTick {
  value: number;
  label: string | undefined;
}

/**
 * How a continuous axis spaces its values: evenly, by their logarithms, by their square roots (signed,
 * so negative values mirror positive ones), or as times in milliseconds since the epoch.
 */
export type AxisKind = 'linear' | 'log' | 'sqrt' | 'time';

/**
 * A continuous axis, whatever its kind: `type` names the family, `kind` how it spaces values. Time
 * values are milliseconds since the epoch from here on.
 */
export interface CheckedLinearAxis {
  type: 'linear';
  kind: AxisKind;
  path: string;
  title: string | undefined;
  min: number | undefined;
  max: number | undefined;
  /** A tick at every multiple of this, counted from zero. */
  step: number | undefined;
  /** On a time axis, a tick on every boundary of this interval. */
  interval: TimeInterval | undefined;
  /** Exactly these ticks, increasing. */
  ticks: CheckedTick[] | undefined;
  percent: boolean;
  grid: boolean;
  hidden: boolean;
  /** 0 on an axis that cannot rotate its labels. */
  labelAngle: number;
  format: CheckedFormat;
  /** The names of the months, for a time axis' labels. */
  months: readonly string[];
}

export type CheckedAxis = CheckedBandAxis | CheckedLinearAxis;

export interface CheckedSweep {
  startAngle: number;
  endAngle: number;
}

export type CheckedAngleAxis = (CheckedBandAxis | CheckedLinearAxis) & CheckedSweep;

export type CheckedRadiusAxis = (CheckedBandAxis | CheckedLinearAxis) & {
  /** As a share of the radius. */
  innerRadius: number;
  shape: 'polygon' | 'circle';
};

export const anyValue = number(-MAX_VALUE, MAX_VALUE);
const labelAngle = number(-MAX_LABEL_ANGLE, MAX_LABEL_ANGLE);

/** Reads an axis' own keys beyond the common ones, from the same fields, once those are checked. */
type Extra<X> = (r: Fields, path: string, type: 'band' | AxisKind) => X;

// An extra may return no key that every axis has: spread in last, it would replace that key.
type Beyond<X> = [Extract<keyof X, keyof CheckedBandAxis | keyof CheckedLinearAxis>] extends [never] ? unknown : never;

const noExtra: Extra<object> = () => ({});

/** For each axis type a context accepts, the keys it allows. */
type AxisKeys = { band: readonly string[] } & Partial<Record<AxisKind, readonly string[]>>;

/**
 * An axis of one of the types `keys` lists, allowing that type's keys. Gridlines of a continuous one
 * default to `grid`; `extra` reads what the axis has beyond the common keys.
 */
export function checkAxis<X extends object = object>(
  keys: AxisKeys,
  grid: boolean,
  extra: Extra<X> & Beyond<X> = noExtra as Extra<X> & Beyond<X>,
  onStacks?: (path: string) => undefined,
): Check<(CheckedBandAxis | CheckedLinearAxis) & X> {
  return (path, raw) => {
    const type = readType(path, raw, Object.keys(keys));
    return type === 'band'
      ? checkBandAxis(keys.band, extra, onStacks)(path, raw)
      : checkLinearAxis(keys[type as AxisKind]!, grid, extra, type as AxisKind)(path, raw);
  };
}

/** A continuous axis of one of the kinds `keys` lists, allowing that kind's keys. */
export function checkContinuousAxis<X extends object = object>(
  keys: Partial<Record<AxisKind, readonly string[]>>,
  grid: boolean,
  extra: Extra<X> & Beyond<X> = noExtra as Extra<X> & Beyond<X>,
): Check<CheckedLinearAxis & X> {
  return (path, raw) => {
    const kind = readType(path, raw, Object.keys(keys)) as AxisKind;
    return checkLinearAxis(keys[kind]!, grid, extra, kind)(path, raw);
  };
}

// An axis' type, one of `types`, read once here and checked again by the reader of its keys.
function readType(path: string, raw: unknown, types: readonly string[]): string {
  return fields(path, raw).required('type', (typePath, given) => {
    if (typeof given === 'string' && types.includes(given)) {
      return given;
    }
    const quoted = types.map((type) => `"${type}"`);
    const choices = quoted.length < 3 ? quoted.join(' or ') : `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}`;
    return fail(typePath, `must be ${choices}, got ${show(given)}`);
  });
}

const CONTINUOUS_KEYS = { linear: LINEAR_KEYS, time: TIME_KEYS, log: LOG_KEYS, sqrt: SQRT_KEYS };

export const CARTESIAN_KEYS = { band: ['type', 'categories', 'weights', 'title', 'hidden', 'labelAngle'], ...CONTINUOUS_KEYS };

/** The second value axis, on the right: continuous, but never time. */
export const checkY2Axis = checkContinuousAxis({ linear: LINEAR_KEYS, log: LOG_KEYS, sqrt: SQRT_KEYS }, false);

/**
 * `onStacks` is told the path of `weights: "stacks"`, which only a chart that knows its series can
 * turn into weights; without it, `"stacks"` is not a weight.
 */
function checkBandAxis<X extends object = object>(
  keys: readonly string[],
  extra: Extra<X> & Beyond<X> = noExtra as Extra<X> & Beyond<X>,
  onStacks?: (path: string) => undefined,
): Check<CheckedBandAxis & X> {
  return (path, raw) => {
    const r = fields(path, raw);
    r.allow(keys);
    r.required('type', (typePath, given) =>
      given === 'band' ? given : fail(typePath, `must be "band", got ${show(given)}`),
    );
    const categories = r.required('categories', list(1, MAX_CATEGORIES, text(MAX_NAME)));
    unique(categories, (i) => `${path}.categories[${i}]`);
    const weighted = list(categories.length, categories.length, number(0.000001, 1000000));
    const weights = r.optional('weights', (weightsPath, given) =>
      given === 'stacks' && onStacks ? onStacks(weightsPath) : weighted(weightsPath, given));
    const title = r.optional('title', text());
    const hidden = r.optional('hidden', boolean) ?? false;
    return {
      type: 'band',
      path,
      categories,
      ...(weights ? { weights } : {}),
      title,
      hidden,
      labelAngle: r.optional('labelAngle', labelAngle) ?? 0,
      ...extra(r, path, 'band'),
    };
  };
}

export function checkLinearAxis<X extends object = object>(
  keys: readonly string[],
  grid: boolean,
  extra: Extra<X> & Beyond<X> = noExtra as Extra<X> & Beyond<X>,
  kind: AxisKind = 'linear',
): Check<CheckedLinearAxis & X> {
  const value = valueReader(kind);
  const written = (at: number): string => writtenOn(kind, at);
  return (path, raw) => {
    const r = fields(path, raw);
    r.allow(keys);
    r.required('type', (typePath, given) =>
      given === kind ? given : fail(typePath, `must be "${kind}", got ${show(given)}`),
    );
    const min = r.optional('min', value);
    const max = r.optional('max', value);
    if (min !== undefined && max !== undefined && !(max > min)) {
      fail(`${path}.max`, `must be greater than min (${written(min)}), got ${written(max)}`);
    }
    const step = kind === 'time' ? undefined : r.optional('step', checkStep);
    const every = kind === 'time' ? r.optional('step', checkInterval) : undefined;
    const ticks = r.optional('ticks', list(1, MAX_TICKS, tickReader(value)));
    if ((step !== undefined || every !== undefined) && ticks !== undefined) {
      fail(path, 'cannot combine step and ticks');
    }
    ticks?.forEach((tick, i) => {
      const at = `${path}.ticks[${i}]`;
      if (i > 0 && !(tick.value > ticks[i - 1]!.value)) {
        fail(at, `must be greater than the tick before it (${written(ticks[i - 1]!.value)}), got ${written(tick.value)}`);
      }
      if ((min !== undefined && tick.value < min) || (max !== undefined && tick.value > max)) {
        fail(at, `must be within the axis' fixed ends, got ${written(tick.value)}`);
      }
    });
    const percent = r.optional('percent', boolean) ?? false;
    const format = r.optional('format', fields);
    format?.allow(kind === 'time' ? ['months'] : ['decimals', 'thousandsSeparator', 'decimalSeparator', 'prefix', 'suffix']);
    const formatText = (key: string, fallback: string): string =>
      format?.optional(key, text(MAX_FORMAT_TEXT)) ?? fallback;
    return {
      type: 'linear',
      kind,
      path,
      title: r.optional('title', text()),
      min,
      max,
      step,
      interval: every,
      ticks,
      percent,
      grid: r.optional('grid', boolean) ?? grid,
      hidden: r.optional('hidden', boolean) ?? false,
      labelAngle: r.optional('labelAngle', labelAngle) ?? 0,
      format: {
        decimals: kind === 'time' ? undefined : format?.optional('decimals', integer(0, MAX_DECIMALS)),
        thousandsSeparator: kind === 'time' ? ',' : formatText('thousandsSeparator', ','),
        decimalSeparator: kind === 'time' ? '.' : formatText('decimalSeparator', '.'),
        prefix: kind === 'time' ? '' : formatText('prefix', ''),
        suffix: kind === 'time' ? '' : formatText('suffix', percent ? '%' : ''),
      },
      months: (kind === 'time' ? format?.optional('months', list(12, 12, text(MAX_MONTH))) : undefined) ?? ENGLISH_MONTHS,
      ...extra(r, path, kind),
    };
  };
}

/**
 * How an axis of `kind` reads one of its values: a number on a linear or square-root axis, a number
 * a log axis can show, or a time.
 */
export function valueReader(kind: AxisKind): Check<number> {
  switch (kind) {
    case 'time':
      return time;
    case 'log':
      return number(MIN_LOG, MAX_VALUE, 'on a log axis');
    default:
      return anyValue;
  }
}

const POLAR_LINEAR_KEYS = ['type', 'min', 'max', 'step', 'ticks', 'grid', 'hidden', 'format'];
const POLAR_BAND_KEYS = ['type', 'categories', 'hidden'];
const SWEEP_KEYS = ['startAngle', 'endAngle'];
const HOLE_KEYS = ['innerRadius'];

/** The keys of a polar axis, band or linear, with `extra` added to both. */
function polarKeys(extra: readonly string[]): { band: readonly string[]; linear: readonly string[] } {
  return { band: [...POLAR_BAND_KEYS, ...extra], linear: [...POLAR_LINEAR_KEYS, ...extra] };
}

export const checkAngleAxis = checkAxis(polarKeys(SWEEP_KEYS), true, (r, path) => checkSweep(r, path));

export const checkRadiusAxis = checkAxis(polarKeys([...HOLE_KEYS, 'shape']), true, (r, _path, type) => ({
  innerRadius: r.optional('innerRadius', number(0, MAX_HOLE)) ?? 0,
  // Resolved against the series once they are known.
  givenShape:
    type === 'band'
      ? r.optional('shape', (shapePath) => fail(shapePath, 'is only for a linear radius axis'))
      : r.optional('shape', oneOf(['polygon', 'circle'] as const)),
}));

/**
 * `startAngle` and `endAngle` at `path`, by default `start` and `end`: `endAngle` greater, and at
 * most a whole turn past it.
 */
export function checkSweep(r: Fields, path: string, [start, end]: [number, number] = [0, 360]): CheckedSweep {
  const startAngle = r.optional('startAngle', number(-360, 360)) ?? start;
  const endAngle = r.optional('endAngle', number(-360, 720)) ?? end;
  if (!(endAngle > startAngle && endAngle - startAngle <= 360 + TURN_ROUNDING)) {
    // Name the angle the spec gave: a defaulted one is not the one to change.
    if (!r.has('endAngle')) {
      fail(`${path}.startAngle`, `must be less than the default endAngle (${endAngle}) and at most 360 before it, got ${startAngle}`);
    }
    const after = `greater than ${r.has('startAngle') ? '' : 'the default '}startAngle (${startAngle}) and at most 360 past it`;
    fail(`${path}.endAngle`, `must be ${after}, got ${endAngle}`);
  }
  return { startAngle, endAngle };
}

// A positive step whose decimals a format can write, so its ticks are exact decimals.
const checkStep: Check<number> = (path, value) => {
  if (typeof value !== 'number' || !(value > 0 && value <= MAX_VALUE)) {
    fail(path, `must be a number above 0 and at most ${bound(MAX_VALUE)}, got ${show(value)}`);
  }
  if (decimalsOf(value) > MAX_DECIMALS) {
    fail(path, `must have at most ${MAX_DECIMALS} decimals, got ${show(value)}`);
  }
  return value;
};

// A value, or a value with its own label.
function tickReader(value: Check<number>): Check<CheckedTick> {
  return (path, raw) => {
    if (typeof raw === 'number' || typeof raw === 'string') {
      return { value: value(path, raw), label: undefined };
    }
    const r = fields(path, raw);
    r.allow(['value', 'label']);
    return { value: r.required('value', value), label: r.optional('label', text(MAX_NAME)) };
  };
}

// A time axis' step: a unit, and how many of it, 1 by default.
const checkInterval: Check<TimeInterval> = (path, raw) => {
  const r = fields(path, raw);
  r.allow(['unit', 'every']);
  return interval(r.required('unit', oneOf(TIME_UNITS)), r.optional('every', integer(1, MAX_EVERY)) ?? 1);
};

/** How a value on a continuous axis is read: a time on a time axis, else a number. */
export function readerOn(axis: CheckedLinearAxis): Check<number> {
  return axis.kind === 'time' ? valueReader('time') : numberOn(axis);
}

// A number on a continuous axis that is not a time axis: a string is a mistake there, and a log axis
// takes only what it can show.
function numberOn(axis: CheckedLinearAxis): Check<number> {
  const value = valueReader(axis.kind);
  return (path, raw) => {
    if (typeof raw === 'string') {
      fail(path, `must be a number, since ${axis.path} is not a time axis, got ${show(raw)}`);
    }
    return value(path, raw);
  };
}

/** The index of `given` among the band axis' categories; anything else is an error at `path`. */
export function categoryOf(axis: CheckedBandAxis, given: unknown, path: string): number {
  const index = typeof given === 'string' ? axis.categories.indexOf(given) : -1;
  return index >= 0 ? index : fail(path, `is not a category of ${axis.path}, got ${show(given)}`);
}
