import type { CheckedFormat, CheckedLinearAxis } from './check-axis.js';
import { fail, MAX_DECIMALS } from './read.js';

// Powers of ten as literals, which are correctly rounded, rather than `10 ** n` or `Math.pow`, which
// may differ in the last bit between JavaScript engines. Index i holds 10^(i - 20).
const POWERS = [
  1e-20, 1e-19, 1e-18, 1e-17, 1e-16, 1e-15, 1e-14, 1e-13, 1e-12, 1e-11, 1e-10, 1e-9, 1e-8, 1e-7, 1e-6, 1e-5,
  1e-4, 1e-3, 1e-2, 1e-1, 1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15,
  1e16, 1e17, 1e18, 1e19, 1e20,
];
const EXPONENT_OFFSET = 20;
// Where a step is rounded up to the next of 1, 2, 5 and 10: the geometric middle of each pair. The
// tick steps are adapted from d3-array's `ticks` (see THIRD_PARTY_NOTICES.md). Square roots are
// correctly rounded, so these are the same everywhere.
const ROUND_TO_10 = Math.sqrt(50);
const ROUND_TO_5 = Math.sqrt(10);
const ROUND_TO_2 = Math.sqrt(2);
// Values closer than this share of their size are drawn as equal.
const EQUAL_SHARE = 1e-9;
// About one tick per this many units of axis.
const TICK_SPACING = 50;

/** Numbers with no axis to take a format from: pie values, bubble sizes. */
export const PLAIN_FORMAT: CheckedFormat = {
  decimals: undefined,
  thousands: ',',
  decimal: '.',
  prefix: '',
  suffix: '',
};

/** A linear scale before it is given a place: its ends, ticks and their labels. */
export interface Scale {
  /** The ends of the axis, rounded out to ticks unless fixed. */
  domain: [number, number];
  ticks: number[];
  /** The ticks written in the axis format. */
  labels: string[];
  /** Where a value lies along the domain: 0 at its start, 1 at its end. */
  fraction: (value: number) => number;
  /** The indices of the ticks to label when labels must be at least `every` tick spacings apart. */
  labelled: (every: number) => number[];
}

/** A scale with a place: `at` maps a value to a position. */
export interface PlacedScale extends Scale {
  at: (value: number) => number;
}

/**
 * A scale for the axis over the data's extent, rounded out to "nice" ticks (1, 2 or 5 times a power
 * of ten) about one per 50 units of its `length`. A fixed `min` or `max` is an end instead, and data
 * beyond it is an error. Only + − × ÷ and exact rounding.
 */
export function linearScale(axis: CheckedLinearAxis, [lo, hi]: [number, number], length: number): Scale {
  if (axis.min !== undefined && lo < axis.min) {
    fail(`${axis.path}.min`, `is ${axis.min}, but the data reach ${lo}`);
  }
  if (axis.max !== undefined && hi > axis.max) {
    fail(`${axis.path}.max`, `is ${axis.max}, but the data reach ${hi}`);
  }
  let [low, high] = [axis.min ?? lo, axis.max ?? hi];
  // An axis fixed at both ends shows exactly them, however close together; validation has made sure
  // that max is above min.
  const fixed = axis.min !== undefined && axis.max !== undefined;
  const flat = !fixed && high - low <= Math.max(Math.abs(low), Math.abs(high)) * EQUAL_SHARE;
  if (flat) {
    // One value, or values too close to tell apart: show them against zero, or 0 to 1 for zero.
    [low, high] = low === 0 && high === 0 ? [0, 1] : [Math.min(0, low, high), Math.max(0, low, high)];
  }
  if (high - low < POWERS[0]!) {
    fail(axis.path, `has values that differ by ${high - low}, less than the smallest tick step, ${POWERS[0]}`);
  }
  const count = Math.max(2, Math.floor(length / TICK_SPACING));
  let step = tickStep(low, high, count);
  let domain: [number, number] = [axis.min ?? step.tick(step.floor(low)), axis.max ?? step.tick(step.ceil(high))];
  if (!(domain[1] > domain[0])) {
    // A fixed end met data that all equal it: the free end moves one tick outward.
    domain =
      axis.max === undefined
        ? [domain[0], step.tick(step.ceil(domain[0]) + 1)]
        : [step.tick(step.floor(domain[1]) - 1), domain[1]];
  }
  if (flat && (axis.min !== undefined || axis.max !== undefined)) {
    // Against a fixed end, the step of flat data came from the range widened against zero, not the
    // range shown: it is chosen again for that range, which then gets as many ticks as any axis of
    // its length, and the free end is rounded out to it.
    step = tickStep(domain[0], domain[1], count);
    domain = axis.max === undefined ? [domain[0], step.tick(step.ceil(domain[1]))] : [step.tick(step.floor(domain[0])), domain[1]];
  }
  const numbers = integersBetween(step.ceil(domain[0]), step.floor(domain[1]));
  const ticks = numbers.map(step.tick);
  const span = domain[1] - domain[0];
  const fraction = (value: number): number => (value - domain[0]) / span;
  if (ticks.some((tick, i) => i > 0 && !(tick > ticks[i - 1]!))) {
    // Ends fixed so close that the doubles between them run out repeat their ticks (from 1 to
    // 1 + 2^-52, 257 ticks hold 2 values): the ends alone are the ticks then, written with the
    // decimals that tell them apart.
    const decimals = axis.format.decimals ?? decimalsApart(domain[0], domain[1]);
    return {
      domain,
      ticks: [...domain],
      labels: domain.map((end) => formatNumber(end, decimals, axis.format)),
      fraction,
      labelled: (every) => (every <= 1 ? [0, 1] : [0]),
    };
  }
  const decimals = axis.format.decimals ?? step.decimals;
  return {
    domain,
    ticks,
    labels: ticks.map((tick) => formatNumber(tick, decimals, axis.format)),
    fraction,
    labelled: (every) => labelledEvery(numbers, step.factor, every),
  };
}

/** Gives a scale its place, from `from` at the start of the domain to `to` at its end. */
export function place(scale: Scale, [from, to]: [number, number]): PlacedScale {
  return { ...scale, at: (value) => from + scale.fraction(value) * (to - from) };
}

interface TickStep {
  /** The tick numbered `index`. */
  tick: (index: number) => number;
  /** The number of the last tick at or below `value`. */
  floor: (value: number) => number;
  /** The number of the first tick at or above `value`. */
  ceil: (value: number) => number;
  /** Decimals that tell the ticks apart. */
  decimals: number;
  /** The step is this times a power of ten: 1, 2, 5 or 10. */
  factor: number;
}

// Ticks are integers divided by a power of ten, rather than a fraction multiplied, so 0.3 is the
// nearest double to 0.3 and not 0.30000000000000004. A tick number is rounded, then moved by one if
// the rounding crossed the value, since 0.3 × 10 is 3.0000000000000004 and its ceiling would be 4.
function tickStep(lo: number, hi: number, count: number): TickStep {
  const raw = (hi - lo) / count;
  let index = 0;
  while (index + 1 < POWERS.length && POWERS[index + 1]! <= raw) {
    index++;
  }
  const error = raw / POWERS[index]!;
  const factor = error >= ROUND_TO_10 ? 10 : error >= ROUND_TO_5 ? 5 : error >= ROUND_TO_2 ? 2 : 1;
  const exponent = index - EXPONENT_OFFSET;
  // A step below 1 is held as its inverse, an integer-valued power of ten over the factor.
  const inverse = exponent < 0 ? POWERS[EXPONENT_OFFSET - exponent]! / factor : 0;
  const step = POWERS[index]! * factor;
  const tick = (i: number): number => (exponent < 0 ? i / inverse : i * step);
  const nearest = (value: number): number => Math.round(exponent < 0 ? value * inverse : value / step);
  return {
    tick,
    floor: (value) => {
      const i = nearest(value);
      return tick(i) > value ? i - 1 : i;
    },
    ceil: (value) => {
      const i = nearest(value);
      return tick(i) < value ? i + 1 : i;
    },
    decimals: exponent < 0 ? Math.max(0, -exponent - (factor === 10 ? 1 : 0)) : 0,
    factor,
  };
}

/**
 * The ticks to label when labels must be `every` tick spacings apart: those whose number is a
 * multiple of the smallest k of at least `every` that keeps the labelled step 1, 2 or 5 times a power
 * of ten, counted from zero, so a crowded step-2 axis shows 0, 10, 20 rather than 0, 6, 12. When no
 * tick is such a multiple, the one that is a multiple of the largest smaller k is labelled alone.
 */
function labelledEvery(numbers: readonly number[], factor: number, every: number): number[] {
  const indices = numbers.map((_, i) => i);
  if (every <= 1) {
    return indices;
  }
  const largest = Math.max(...numbers.map(Math.abs));
  let alone: number[] = [];
  for (let k = 2; k <= Math.max(every, largest); k++) {
    if (!isNice(factor * k)) {
      continue;
    }
    const shown = indices.filter((i) => numbers[i]! % k === 0);
    if (k >= every && shown.length > 0) {
      return shown;
    }
    alone = shown.length > 0 ? [shown[0]!] : alone;
  }
  return alone.length > 0 ? alone : [0];
}

// Whether a whole number is 1, 2 or 5 times a power of ten.
function isNice(value: number): boolean {
  let rest = value;
  while (rest % 10 === 0) {
    rest /= 10;
  }
  return rest === 1 || rest === 2 || rest === 5;
}

/** The fewest decimals, up to the most a format allows, that write two numbers differently. */
function decimalsApart(a: number, b: number): number {
  let decimals = 0;
  while (decimals < MAX_DECIMALS && a.toFixed(decimals) === b.toFixed(decimals)) {
    decimals++;
  }
  return decimals;
}

function integersBetween(first: number, last: number): number[] {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
}

export interface BandScale {
  /** Where each category's band starts. */
  start: (index: number) => number;
  /** The smallest band width; every band has this width when weights are omitted. */
  bandwidth: number;
  width: (index: number) => number;
  /** The smallest distance from one band's start to the next, used for conservative label thinning. */
  step: number;
}

/** Bands across the range: equal by default, or proportional to weights, with equal inner and outer gaps. */
export function bandScale(count: number, [from, to]: [number, number], padding: number, weights?: readonly number[]): BandScale {
  if (weights && !weights.every((weight) => weight === weights[0])) {
    const sum = weights.reduce((total, value) => total + value, 0);
    const unit = (to - from) / (sum * (1 + padding / count));
    const gap = unit * sum / count * padding;
    const offset = from + gap;
    let position = offset;
    const starts = weights.map((weight) => {
      const start = position;
      position += weight * unit * (1 - padding) + gap;
      return start;
    });
    const bandwidth = Math.min(...weights) * unit * (1 - padding);
    return { start: (i) => starts[i]!, width: (i) => weights[i]! * unit * (1 - padding),
      bandwidth, step: bandwidth + gap };
  }
  const step = (to - from) / (count + padding);
  const offset = from + step * padding;
  return { start: (index) => offset + index * step, bandwidth: step * (1 - padding), width: () => step * (1 - padding), step };
}

/** Writes a number with fixed decimals, the format's separators and affixes, and no locale data. */
export function formatNumber(value: number, decimals: number, format: CheckedFormat): string {
  const digits = Math.abs(value).toFixed(decimals);
  const [whole = '', fraction] = digits.split('.');
  // A function, so a separator such as "$&" is not read as a replacement pattern.
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, () => format.thousands);
  // A value that rounds to zero is written without a sign.
  const sign = value < 0 && /[1-9]/.test(digits) ? '-' : '';
  const fractionText = fraction === undefined ? '' : `${format.decimal}${fraction}`;
  return `${sign}${format.prefix}${grouped}${fractionText}${format.suffix}`;
}


/** A value in a tooltip: all the decimals it has (at most MAX_DECIMALS), unless the format fixes them. */
export function formatValue(value: number, format: CheckedFormat = PLAIN_FORMAT): string {
  const [mantissa = '', exponent] = String(Math.abs(value)).split('e');
  const decimals = Math.min(MAX_DECIMALS, Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent ?? 0)));
  return formatNumber(value, format.decimals ?? decimals, format);
}

/** Raw data values keep the value axis' format, without a percent-stack suffix. */
export function formatAxisValue(value: number, axis: CheckedLinearAxis): string {
  return formatValue(value, { ...axis.format, suffix: axis.percent ? '' : axis.format.suffix });
}
