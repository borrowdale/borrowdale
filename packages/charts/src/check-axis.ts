// Reading the axes of a chart spec: band and linear axes, their number formats and sweeps, and the
// keys each coordinate system allows on them. Independent of series, which validate.ts reads.
import {
  boolean,
  fail,
  fields,
  integer,
  list,
  MAX_DECIMALS,
  MAX_VALUE,
  number,
  oneOf,
  show,
  text,
  unique,
  type Check,
  type Fields,
} from './read.js';

export const MAX_CATEGORIES = 1_000;
// Every mark's tooltip repeats its series and category names, so a long one multiplies the size of
// the drawing.
export const MAX_NAME = 100;
// For a number format's separators, prefix and suffix.
const MAX_FORMAT_TEXT = 10;

export const LINEAR_KEYS = ['type', 'title', 'min', 'max', 'percent', 'grid', 'hidden', 'format', 'labelAngle'];
const MAX_LABEL_ANGLE = 90;
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
  thousands: string;
  decimal: string;
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

export interface CheckedLinearAxis {
  type: 'linear';
  path: string;
  title: string | undefined;
  min: number | undefined;
  max: number | undefined;
  percent: boolean;
  grid: boolean;
  hidden: boolean;
  /** 0 on an axis that cannot rotate its labels. */
  labelAngle: number;
  format: CheckedFormat;
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
type Extra<X> = (r: Fields, path: string, type: 'band' | 'linear') => X;

const noExtra: Extra<object> = () => ({});

/**
 * An axis, band or linear by its `type`, allowing `keys.band` or `keys.linear`. Gridlines of a
 * linear one default to `grid`; `extra` reads what the axis has beyond the common keys.
 */
export function checkAxis<X extends object = object>(
  keys: { band: readonly string[]; linear: readonly string[] },
  grid: boolean,
  extra: Extra<X> = noExtra as Extra<X>,
): Check<(CheckedBandAxis | CheckedLinearAxis) & X> {
  return (path, raw) => {
    const type = fields(path, raw).required('type', (typePath, given) =>
      given === 'band' || given === 'linear' ? given : fail(typePath, `must be "band" or "linear", got ${show(given)}`),
    );
    return type === 'band'
      ? checkBandAxis(keys.band, extra)(path, raw)
      : checkLinearAxis(keys.linear, grid, extra)(path, raw);
  };
}

export const CARTESIAN_KEYS = { band: ['type', 'categories', 'weights', 'title', 'hidden', 'labelAngle'], linear: LINEAR_KEYS };

function checkBandAxis<X extends object = object>(
  keys: readonly string[],
  extra: Extra<X> = noExtra as Extra<X>,
): Check<CheckedBandAxis & X> {
  return (path, raw) => {
    const r = fields(path, raw);
    r.allow(keys);
    r.required('type', (typePath, given) =>
      given === 'band' ? given : fail(typePath, `must be "band", got ${show(given)}`),
    );
    const categories = r.required('categories', list(1, MAX_CATEGORIES, text(MAX_NAME)));
    unique(categories, (i) => `${path}.categories[${i}]`);
    const weights = r.optional('weights', list(categories.length, categories.length, number(0.000001, 1000000)));
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
  extra: Extra<X> = noExtra as Extra<X>,
): Check<CheckedLinearAxis & X> {
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
      labelAngle: r.optional('labelAngle', labelAngle) ?? 0,
      format: {
        decimals: format?.optional('decimals', integer(0, MAX_DECIMALS)),
        thousands: formatText('thousands', ','),
        decimal: formatText('decimal', '.'),
        prefix: formatText('prefix', ''),
        suffix: formatText('suffix', percent ? '%' : ''),
      },
      ...extra(r, path, 'linear'),
    };
  };
}

const POLAR_LINEAR_KEYS = ['type', 'min', 'max', 'grid', 'hidden', 'format'];
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
  shapeGiven:
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
    const after = `greater than startAngle (${startAngle}) and at most 360 past it`;
    fail(`${path}.endAngle`, `must be ${after}, got ${endAngle}`);
  }
  return { startAngle, endAngle };
}
