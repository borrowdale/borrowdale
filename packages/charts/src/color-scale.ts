// A colour axis: how values become colours, and what its legend shows. Only + − × ÷ and exact
// rounding, so every engine picks the same colour for a value.
import type { CheckedLinearAxis } from './check-axis.js';
import { fail, MAX_DECIMALS } from './read.js';
import { formatAxisValue, formatNumber, scaleOf } from './scale.js';
import { quantile } from './statistics/geometry.js';
import type { ColorScaleKind, ColorScheme } from './types.js';

// ColorBrewer's 11-class RdBu (Apache-2.0), from dark red to dark blue.
const RED_BLUE = ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'];

/**
 * Hex stops, from the lowest value to the highest. `viridis` is sampled at nine even steps from the
 * colour map of the same name (CC0); `red-blue` is ColorBrewer's RdBu, and `blue-red` the same
 * reversed, for values where high reads as warm. All stay readable with the common forms of colour
 * blindness.
 */
export const SCHEMES: Record<ColorScheme, readonly string[]> = {
  viridis: ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'],
  'red-blue': RED_BLUE,
  'blue-red': [...RED_BLUE].reverse(),
};

/** The most classes a classed scale may have: as many as a horizon of 6 bands takes. */
export const MAX_CLASSES = 12;
// How far apart, as a share of a class's width, a computed quantize boundary and a decimal may be and
// still be taken as the same number: binary rounding, far below any difference the legend can write.
const ROUNDING = 1e-12;
// How long the scale is taken to be when its free ends are rounded out to ticks: a ramp's length.
const RAMP_LENGTH = 120;

/** A colour axis as validation reads it: the options given, defaults resolved later per chart. */
export interface CheckedColorAxis extends CheckedLinearAxis {
  scale: ColorScaleKind | undefined;
  scheme: ColorScheme | undefined;
  /** Custom hex stops, in place of a scheme. */
  stops: string[] | undefined;
  classes: number | undefined;
  breaks: number[] | undefined;
  midpoint: number | undefined;
}

/** What a chart's series ask of its colour axis when the spec leaves it to them. */
export interface ColorDefaults {
  scale: ColorScaleKind;
  /** Defaults to `red-blue` for a diverging scale and `viridis` otherwise. */
  scheme?: ColorScheme | undefined;
  /** Fixed ends, as a correlation's −1 and 1, unless the axis sets its own. */
  domain?: [number, number] | undefined;
  classes?: number | undefined;
  /**
   * Whether the domain is symmetric about 0, as a horizon's is: once rounded out, each end reaches as
   * far as the further one.
   */
  symmetric?: boolean | undefined;
}

/** What a colour legend draws: a continuous ramp, or one swatch per class between boundary labels. */
export type ColorLegend =
  | { kind: 'ramp'; stops: { offset: number; color: string }[]; labels: [string, string] }
  /** `labels` has one more entry than `colors`: an empty one is an open end. */
  | { kind: 'classes'; colors: string[]; labels: string[] };

/** A colour axis resolved for one chart: how it colours, writes and labels values. */
export interface ColorScale {
  domain: [number, number];
  color: (value: number) => string;
  /** A value as tooltips and labels write it, in the axis' format. */
  format: (value: number) => string;
  legend: ColorLegend;
  /** Written before the legend. */
  title: string | undefined;
}

interface Resolved {
  axis: CheckedColorAxis;
  stops: readonly string[];
  domain: [number, number];
  /** Every value encoded, sorted. */
  values: readonly number[];
  classes: number;
}

/**
 * How each kind maps a value to a colour. A `Record`, so a kind added to `ColorScaleKind` without its
 * branch fails to compile.
 */
const KINDS: Record<ColorScaleKind, (resolved: Resolved) => ColorScale> = {
  sequential: ({ axis, stops, domain }) => continuous(axis, stops, domain, linearFraction(domain)),
  diverging: ({ axis, stops, domain }) => {
    const [lo, hi] = domain;
    const middle = axis.midpoint ?? (lo < 0 && hi > 0 ? 0 : (lo + hi) / 2);
    if (!(middle > lo && middle < hi)) {
      fail(`${axis.path}.midpoint`, `must be inside the colour domain, ${formatAxisValue(lo, axis)} to ${formatAxisValue(hi, axis)}, got ${middle}`);
    }
    return continuous(axis, stops, domain, (value) =>
      value < middle ? (0.5 * (value - lo)) / (middle - lo) : 0.5 + (0.5 * (value - middle)) / (hi - middle));
  },
  quantize: ({ axis, stops, domain, classes }) => {
    const [lo, hi] = domain;
    const computed = Array.from({ length: classes - 1 }, (_, k) => lo + ((hi - lo) * (k + 1)) / classes);
    const decimals = boundaryDecimals(axis, [lo, ...computed, hi], (hi - lo) / classes);
    return classed(axis, stops, computed.map((at) => written(at, decimals, (hi - lo) / classes)), [lo, hi], decimals);
  },
  quantile: ({ axis, stops, values, classes }) => {
    const distinct = new Set(values).size;
    if (classes > distinct) {
      fail(`${axis.path}.classes`, `is ${classes}, but the values have only ${distinct} distinct ${distinct === 1 ? 'value' : 'values'}`);
    }
    // Its breaks are values of the data, or between two of them, and are used as they are.
    const breaks = Array.from({ length: classes - 1 }, (_, k) => quantile(values, (k + 1) / classes));
    // A break at the lowest value, or equal to the one before it, leaves a class with no value.
    const parts = new Set(breaks.filter((at) => at > values[0]!)).size + 1;
    if (parts < classes) {
      fail(`${axis.path}.classes`, `is ${classes}, but ties in the values leave only ${parts} distinct classes`);
    }
    // A fixed end is an end of the outer class; the values lie within it.
    const [lo, hi] = [axis.min ?? values[0]!, axis.max ?? values.at(-1)!];
    return classed(axis, stops, breaks, [lo, hi], boundaryDecimals(axis, [lo, ...breaks, hi], (hi - lo) / classes));
  },
  threshold: ({ axis, stops }) => classed(axis, stops, axis.breaks!, undefined, undefined),
};

/** The colour scale of `axis` over `values`, with the series' defaults where the axis sets none. */
export function colorScaleOf(axis: CheckedColorAxis, values: readonly number[], defaults: ColorDefaults): ColorScale {
  const kind = axis.scale ?? defaults.scale;
  const classedKind = kind === 'quantize' || kind === 'quantile';
  if (axis.classes !== undefined && !classedKind) fail(`${axis.path}.classes`, `is only for a quantize or quantile scale, not ${kind}`);
  if (axis.breaks === undefined && kind === 'threshold') fail(axis.path, 'is a threshold scale, which needs breaks');
  if (axis.breaks !== undefined && kind !== 'threshold') fail(`${axis.path}.breaks`, `is only for a threshold scale, not ${kind}`);
  if (axis.midpoint !== undefined && kind !== 'diverging') fail(`${axis.path}.midpoint`, `is only for a diverging scale, not ${kind}`);
  const sorted = [...values].sort((a, b) => a - b);
  const fixed: CheckedColorAxis = defaults.domain && axis.min === undefined && axis.max === undefined
    ? { ...axis, min: defaults.domain[0], max: defaults.domain[1] }
    : axis;
  const extent: [number, number] = sorted.length > 0 ? [sorted[0]!, sorted.at(-1)!] : [fixed.min ?? 0, fixed.max ?? 0];
  const rounded = scaleOf(fixed, extent, RAMP_LENGTH).domain;
  const reach = Math.max(Math.abs(rounded[0]), Math.abs(rounded[1]));
  const domain: [number, number] = defaults.symmetric ? [-reach, reach] : rounded;
  const scheme = axis.scheme ?? defaults.scheme ?? (kind === 'diverging' ? 'red-blue' : 'viridis');
  return KINDS[kind]({
    axis: fixed,
    stops: axis.stops ?? SCHEMES[scheme],
    domain,
    values: sorted,
    classes: axis.classes ?? defaults.classes ?? 5,
  });
}

function linearFraction([lo, hi]: [number, number]): (value: number) => number {
  return (value) => (value - lo) / (hi - lo);
}

/** A ramp: `fraction` places a value along the stops, and the legend's gradient follows it. */
function continuous(
  axis: CheckedLinearAxis, stops: readonly string[], domain: [number, number], fraction: (value: number) => number,
): ColorScale {
  const [lo, hi] = domain;
  // Where along the domain each stop falls: the value whose fraction is the stop's.
  const offsets = stops.map((_, i) => {
    const t = i / (stops.length - 1);
    return t === 0 ? 0 : t === 1 ? 1 : (inverse(fraction, t, lo, hi) - lo) / (hi - lo);
  });
  return {
    domain,
    color: (value) => interpolate(stops, fraction(value)),
    format: (value) => formatAxisValue(value, axis),
    title: axis.title,
    legend: {
      kind: 'ramp',
      stops: stops.map((color, i) => ({ offset: offsets[i]!, color })),
      labels: [formatAxisValue(lo, axis), formatAxisValue(hi, axis)],
    },
  };
}

// The value at which an increasing piecewise-linear `fraction` reaches `t`, found by bisection: 60
// halvings take any domain a double can hold to its last bit.
function inverse(fraction: (value: number) => number, t: number, lo: number, hi: number): number {
  let [low, high] = [lo, hi];
  for (let i = 0; i < 60; i++) {
    const middle = (low + high) / 2;
    if (fraction(middle) < t) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * Classes split at increasing `breaks`, each coloured by an even sample of the stops. A value at a
 * break is in the class above it. `ends` label the outer boundaries; a threshold scale's are open.
 */
function classed(
  axis: CheckedLinearAxis,
  stops: readonly string[],
  breaks: readonly number[],
  ends: [number, number] | undefined,
  decimals: number | undefined,
): ColorScale {
  const count = breaks.length + 1;
  const colors = Array.from({ length: count }, (_, k) => interpolate(stops, k / (count - 1)));
  const boundary = (value: number) => decimals === undefined ? formatAxisValue(value, axis) : formatNumber(value, decimals, axis.format);
  const written = breaks.map(boundary);
  return {
    domain: ends ?? [breaks[0]!, breaks.at(-1)!],
    color: (value) => colors[breaks.filter((at) => value >= at).length]!,
    format: (value) => formatAxisValue(value, axis),
    title: axis.title,
    legend: {
      kind: 'classes',
      colors,
      labels: ends ? [boundary(ends[0]), ...written, boundary(ends[1])] : ['', ...written, ''],
    },
  };
}

/**
 * A quantize boundary, computed from the ends of the domain, as the decimal the legend writes it as
 * when the two differ only by binary rounding, which is far below the class `width`: 0.1 + 0.9 × 2 / 9
 * is 0.30000000000000004, and a value of 0.3 is in the class above that boundary. A boundary the
 * legend rounds further keeps its computed value, so the legend's rounding never merges classes.
 */
function written(at: number, decimals: number, width: number): number {
  const decimal = Number(at.toFixed(decimals));
  return Math.abs(decimal - at) <= ROUNDING * width ? decimal : at;
}

/**
 * How many decimals the legend writes computed class boundaries with, unless the format fixes them:
 * the fewest that write every boundary exactly, but no more than give two significant digits of the
 * class `width`. The most is found by multiplying up by tens, as + − × ÷ allow, not by a logarithm.
 */
function boundaryDecimals(axis: CheckedLinearAxis, boundaries: readonly number[], width: number): number {
  if (axis.format.decimals !== undefined) return axis.format.decimals;
  let most = 0;
  for (let scaled = width; scaled > 0 && scaled < 10 && most < MAX_DECIMALS; scaled *= 10) most++;
  let decimals = 0;
  while (decimals < most && !boundaries.every((value) => Number(value.toFixed(decimals)) === value)) decimals++;
  return decimals;
}

/** The colour `t` of the way along the stops, 0 to 1, mixed in sRGB bytes and rounded. */
export function interpolate(stops: readonly string[], t: number): string {
  const at = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(at));
  const [from, to] = [bytesOf(stops[i]!), bytesOf(stops[i + 1]!)];
  const mixed = from.map((byte, k) => Math.round(byte + (to[k]! - byte) * (at - i)));
  const opaque = mixed[3] === 255;
  return `#${(opaque ? mixed.slice(0, 3) : mixed).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The ink a label on a cell of `color` is written in: the usual ink on a light colour, white on a
 * dark one, judged by the colour's weighted brightness, 0 to 255.
 */
export function inkOn(color: string): string | undefined {
  const [red, green, blue, alpha] = bytesOf(color);
  // A mostly transparent cell shows the page through it, so it reads as light.
  return alpha >= 128 && (299 * red + 587 * green + 114 * blue) / 1000 < 128 ? '#ffffff' : undefined;
}

/** A 3, 4, 6 or 8-digit hex colour's red, green, blue and alpha bytes. */
function bytesOf(hex: string): [red: number, green: number, blue: number, alpha: number] {
  const digits = hex.slice(1);
  const long = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const byte = (k: number): number => (k < long.length ? Number.parseInt(long.slice(k, k + 2), 16) : 255);
  return [byte(0), byte(2), byte(4), byte(6)];
}

/**
 * The colour axis of a chart with a series coloured by value, which validation always gives one;
 * its absence is a bug, not a spec error.
 */
export function colorAxisOf(color: ColorScale | undefined, path: string): ColorScale {
  if (!color) throw new Error(`${path} has no colour axis`);
  return color;
}
