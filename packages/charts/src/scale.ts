import { log } from '@borrowdale/core/math';
import type { CheckedFormat, CheckedLinearAxis, CheckedTick } from './check-axis.js';
import { decimalsOf } from './decimals.js';
import { bound, fail, MAX_DECIMALS, MAX_TICKS, MAX_VALUE } from './read.js';
import { formatTick, formatTime, timeScale, writtenOn } from './time.js';

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

/** The scale of a continuous axis before it is given a place: its ends, ticks and their labels. */
export interface Scale {
  /** The ends of the axis, rounded out to ticks unless fixed. */
  domain: [number, number];
  ticks: number[];
  /** The ticks written in the axis format. */
  labels: string[];
  /** Where a value lies along the domain: 0 at its start, 1 at its end. */
  fraction: (value: number) => number;
  /**
   * The indices of the ticks to label when their centres must be `room` apart where `at` puts them.
   * `toEnd` says the axis has an end past its last tick, where room is kept for that tick's label,
   * as a straight axis does and a whole turn does not.
   */
  labelled: (room: number, at: (value: number) => number, toEnd?: boolean) => number[];
}

/**
 * The scale of a continuous axis, by its kind, over the data's extent, for an axis `length` long. A
 * fixed `min` or `max` is an end, and data beyond it is an error, for every kind.
 */
export function scaleOf(axis: CheckedLinearAxis, extent: [number, number], length: number): Scale {
  const [lo, hi] = extent;
  if (axis.min !== undefined && lo < axis.min) {
    fail(`${axis.path}.min`, `is ${writtenOn(axis.kind, axis.min)}, but the data reach ${writtenOn(axis.kind, lo)}`);
  }
  if (axis.max !== undefined && hi > axis.max) {
    fail(`${axis.path}.max`, `is ${writtenOn(axis.kind, axis.max)}, but the data reach ${writtenOn(axis.kind, hi)}`);
  }
  switch (axis.kind) {
    case 'linear':
      return linearScale(axis, extent, length);
    case 'sqrt':
      return sqrtScale(axis, extent, length);
    case 'log':
      return logScale(axis, extent, length);
    case 'time':
      return timeScale(axis, extent, length);
  }
}

/**
 * The extent of an axis with nothing on it: its listed ticks', where there are two or more, or else
 * its fixed end, or 0, or 1 on a log axis, which a lone listed tick then extends. Listed ticks are
 * within the fixed ends, so they never pass them.
 */
export function emptyExtent(axis: CheckedLinearAxis): [number, number] {
  if (axis.ticks !== undefined && axis.ticks.length > 1) {
    return [axis.ticks[0]!.value, axis.ticks.at(-1)!.value];
  }
  const end = axis.min ?? axis.max ?? (axis.kind === 'log' ? 1 : 0);
  return [end, end];
}

/** A scale with a place: `at` maps a value to a position. */
export interface PlacedScale extends Scale {
  at: (value: number) => number;
}

/**
 * A scale for the axis over the data's extent, rounded out to "nice" ticks (1, 2 or 5 times a power
 * of ten) about one per 50 units of its `length`, or to multiples of the axis' `step`, or reaching
 * its listed `ticks`. A fixed `min` or `max` is an end instead, which the data stay within (scaleOf).
 * Only + − × ÷ and exact rounding.
 */
function linearScale(axis: CheckedLinearAxis, [lo, hi]: [number, number], length: number): Scale {
  if (axis.ticks) {
    return listedTicks(axis, axis.ticks, [lo, hi]);
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
  const count = tickCountFor(length);
  let step = axis.step === undefined ? tickStep(low, high, count) : givenStep(axis.step);
  // A free end rounds out no further than the most a value may be either side of zero.
  let domain: [number, number] = [
    axis.min ?? Math.max(-MAX_VALUE, step.tick(step.floor(low))),
    axis.max ?? Math.min(MAX_VALUE, step.tick(step.ceil(high))),
  ];
  if (!(domain[1] > domain[0])) {
    // A fixed end met data that all equal it: the free end moves one tick outward, if there is room.
    if (axis.max === undefined && domain[0] < MAX_VALUE) {
      domain = [domain[0], Math.min(MAX_VALUE, step.tick(step.ceil(domain[0]) + 1))];
    } else if (axis.max === undefined) {
      fail(`${axis.path}.min`, `is ${bound(MAX_VALUE)}, the most an axis shows, which leaves no room above it`);
    } else if (domain[1] > -MAX_VALUE) {
      domain = [Math.max(-MAX_VALUE, step.tick(step.floor(domain[1]) - 1)), domain[1]];
    } else {
      fail(`${axis.path}.max`, `is ${bound(-MAX_VALUE)}, the least an axis shows, which leaves no room below it`);
    }
  }
  if (flat && (axis.min !== undefined || axis.max !== undefined) && axis.step === undefined) {
    // Against a fixed end, the step of flat data came from the range widened against zero, not the
    // range shown: it is chosen again for that range, which then gets as many ticks as any axis of
    // its length, and the free end is rounded out to it.
    step = tickStep(domain[0], domain[1], count);
    domain = axis.max === undefined ? [domain[0], step.tick(step.ceil(domain[1]))] : [step.tick(step.floor(domain[0])), domain[1]];
  }
  const tickCount = step.floor(domain[1]) - step.ceil(domain[0]) + 1;
  if (tickCount > MAX_TICKS) {
    const at = axis.step === undefined ? axis.path : `${axis.path}.step`;
    fail(at, `gives ${tickCount} ticks from ${domain[0]} to ${domain[1]}, more than ${MAX_TICKS}`);
  }
  if (tickCount < 1) {
    fail(`${axis.path}.step`, `puts no tick between ${domain[0]} and ${domain[1]}`);
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
      labelled: (room, at) => (Math.abs(at(domain[1]) - at(domain[0])) >= room ? [0, 1] : [0]),
    };
  }
  const decimals = axis.format.decimals ?? step.decimals;
  return {
    domain,
    ticks,
    labels: ticks.map((tick) => formatNumber(tick, decimals, axis.format)),
    fraction,
    labelled: (room, at) => labelledEvery(numbers, step.factor, everyFor(room, ticks, at)),
  };
}

/**
 * An axis with listed ticks: its free ends reach the outermost tick or value, and each tick has its
 * own label or its value in the axis format. `fraction` places values between the ends linearly.
 */
export function listedTicks(axis: CheckedLinearAxis, listed: readonly CheckedTick[], [lo, hi]: [number, number]): Scale {
  const ticks = listed.map(({ value }) => value);
  const domain: [number, number] = [axis.min ?? Math.min(lo, ticks[0]!), axis.max ?? Math.max(hi, ticks.at(-1)!)];
  if (!(domain[1] > domain[0])) {
    fail(`${axis.path}.ticks`, `and the data all equal ${writtenOn(axis.kind, domain[0])}: give a min, a max or another tick`);
  }
  return {
    domain,
    ticks,
    labels: listed.map(({ value, label }) => label ?? tickText(axis, value)),
    fraction: linearFraction(domain),
    labelled: (room, at, toEnd = true) => (toEnd ? keptToEnd(ticks, room, at, domain) : keptApart(ticks, room, at)),
  };
}

// A listed tick's value, written as the axis writes its ticks.
function tickText(axis: CheckedLinearAxis, value: number): string {
  return axis.kind === 'time' ? formatTick(value, axis.months) : formatValue(value, axis.format);
}

/** Unevenly spaced ticks to label: the first, then each at least `room` past the last one kept. */
export function keptApart(ticks: readonly number[], room: number, at: (value: number) => number): number[] {
  const shown = ticks.length > 0 ? [0] : [];
  for (let i = 1; i < ticks.length; i++) {
    if (Math.abs(at(ticks[i]!) - at(ticks[shown.at(-1)!]!)) >= room) {
      shown.push(i);
    }
  }
  return shown;
}

/**
 * Listed ticks to label: as keptApart, but always the last, since the axis leaves room past its end
 * for the last label only; the labels before it that crowd it are left out instead. When even the
 * first crowds it, the one of the two nearer its own end is labelled alone.
 */
function keptToEnd(ticks: readonly number[], room: number, at: (value: number) => number, [from, to]: [number, number]): number[] {
  const shown = keptApart(ticks, room, at);
  const last = ticks.length - 1;
  const crowds = (i: number): boolean => Math.abs(at(ticks[last]!) - at(ticks[i]!)) < room;
  if (last < 1 || shown.at(-1) === last) {
    return shown;
  }
  while (shown.length > 1 && crowds(shown.at(-1)!)) {
    shown.pop();
  }
  if (!crowds(shown.at(-1)!)) {
    return [...shown, last];
  }
  // Even the first crowds the last: the one of them nearer its own end, where the axis keeps room
  // for its label past that end, or the first where they are as near.
  const [first, end] = [Math.abs(at(ticks[0]!) - at(from)), Math.abs(at(to) - at(ticks[last]!))];
  return end < first ? [last] : [0];
}

function linearFraction([from, to]: [number, number]): (value: number) => number {
  const span = to - from;
  return (value) => (value - from) / span;
}

/**
 * A square-root scale: the ticks of a linear one, placed by the signed square root of each value, so
 * a value's distance from zero grows with its square root and negative values mirror positive ones.
 */
function sqrtScale(axis: CheckedLinearAxis, extent: [number, number], length: number): Scale {
  const scale = linearScale(axis, extent, length);
  return { ...scale, fraction: transformedFraction(axis, scale.domain, signedRoot, 'square roots') };
}

/**
 * Where a value lies between the ends once both are transformed, by a logarithm or a square root.
 * Ends close enough that their transforms are equal leave no room to place a value between them.
 */
function transformedFraction(
  axis: CheckedLinearAxis,
  [from, to]: [number, number],
  transform: (value: number) => number,
  transforms: string,
): (value: number) => number {
  const [start, end] = [transform(from), transform(to)];
  if (!(end > start)) {
    fail(axis.path, `cannot place values between ${from} and ${to}, whose ${transforms} are equal`);
  }
  return (value) => (transform(value) - start) / (end - start);
}

// Square roots are correctly rounded, so the same in every engine.
function signedRoot(value: number): number {
  return value < 0 ? -Math.sqrt(-value) : Math.sqrt(value);
}

// The mantissas of a log axis' ticks in each decade, densest first.
const DECADE_TICKS = [[1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 5], [1]] as const;

/**
 * A base-10 log scale: free ends rounded out to powers of ten, and ticks at 1, 2 and 5 times a power
 * of ten, or every one to nine times, or only the powers, whichever gives about one tick per 50 units
 * without passing that; a range within one power of ten gets linear ticks. Values must be at least
 * MIN_LOG. Positions come from the portable logarithm, so they are the same in every engine.
 */
function logScale(axis: CheckedLinearAxis, [lo, hi]: [number, number], length: number): Scale {
  const spacing = (domain: [number, number]) => transformedFraction(axis, domain, log, 'logarithms');
  if (axis.ticks) {
    const listed = listedTicks(axis, axis.ticks, [lo, hi]);
    return { ...listed, fraction: spacing(listed.domain) };
  }
  // Free ends round out to powers of ten; one value alone shows the power of ten it lies in.
  let domain: [number, number] = [axis.min ?? POWERS[decadeOf(lo) + EXPONENT_OFFSET]!, axis.max ?? powerAtOrAbove(hi)];
  if (!(domain[1] > domain[0])) {
    // A fixed end the data all equal, or one value alone on a power of ten: the free end moves to the
    // next power of ten out from it, below where above passes the most a value may be.
    if (axis.max === undefined && domain[0] < MAX_VALUE) {
      domain = [domain[0], POWERS[decadeOf(domain[0]) + EXPONENT_OFFSET + 1]!];
    } else if (axis.max === undefined && axis.min !== undefined) {
      fail(`${axis.path}.min`, `is ${bound(MAX_VALUE)}, the most a log axis shows, which leaves no room above it`);
    } else {
      const below = POWERS[decadeOf(domain[1]) + EXPONENT_OFFSET - 1];
      domain = [below ?? fail(`${axis.path}.max`, `is ${axis.max}, the least a log axis shows, which leaves no room below it`), domain[1]];
    }
  }
  const count = tickCountFor(length);
  const exponents = integersBetween(decadeOf(domain[0]), decadeOf(domain[1]));
  const candidates = DECADE_TICKS.map((mantissas) =>
    exponents
      .flatMap((exponent) => mantissas.map((mantissa): DecadeTick => ({ mantissa, exponent, value: decimal(mantissa, exponent) })))
      .filter(({ value }) => value >= domain[0] && value <= domain[1]),
  );
  const fitting = candidates.find((ticks) => ticks.length >= 2 && ticks.length <= count + 1);
  const fraction = spacing(domain);
  if (!fitting && candidates[2]!.length < 2) {
    // Fewer than two powers of ten, and no denser ticks that fit: a linear axis' ticks, placed by
    // their logarithms, between the ends decided here, so none falls at or below 0 or past them.
    const linear = linearScale({ ...axis, min: domain[0], max: domain[1] }, domain, length);
    return { ...linear, fraction, labelled: (room, at) => keptApart(linear.ticks, room, at) };
  }
  const chosen = fitting ?? candidates[2]!;
  const ticks = chosen.map(({ value }) => value);
  return {
    domain,
    ticks,
    labels: ticks.map((tick) => formatNumber(tick, axis.format.decimals ?? Math.min(MAX_DECIMALS, decimalsOf(tick)), axis.format)),
    fraction,
    labelled: (room, at) => labelledDecades(chosen, room, at),
  };
}

interface DecadeTick {
  mantissa: number;
  exponent: number;
  value: number;
}

// The power of ten at or below a value of a log axis, as an exponent; exact, by comparing with the
// powers themselves.
function decadeOf(value: number): number {
  let exponent = -EXPONENT_OFFSET;
  while (exponent + EXPONENT_OFFSET + 1 < POWERS.length && POWERS[exponent + EXPONENT_OFFSET + 1]! <= value) {
    exponent++;
  }
  return exponent;
}

function powerAtOrAbove(value: number): number {
  const exponent = decadeOf(value);
  return POWERS[exponent + EXPONENT_OFFSET]! === value ? value : POWERS[exponent + EXPONENT_OFFSET + 1]!;
}

// mantissa × 10^exponent as the nearest double to that decimal: an integer times a power, or over one.
function decimal(mantissa: number, exponent: number): number {
  return exponent < 0 ? mantissa / POWERS[EXPONENT_OFFSET - exponent]! : mantissa * POWERS[EXPONENT_OFFSET + exponent]!;
}

// The densest of: every tick, the 1, 2 and 5 multiples, the powers of ten, or every k-th power of
// ten counted from 10^0 with k a nice number, whose labels are all `room` apart.
function labelledDecades(ticks: readonly DecadeTick[], room: number, at: (value: number) => number): number[] {
  const indices = ticks.map((_, i) => i);
  const apart = (shown: readonly number[]): boolean =>
    shown.every((index, i) => i === 0 || Math.abs(at(ticks[index]!.value) - at(ticks[shown[i - 1]!]!.value)) >= room);
  const powers = indices.filter((i) => ticks[i]!.mantissa === 1);
  const subsets = [
    indices,
    indices.filter((i) => [1, 2, 5].includes(ticks[i]!.mantissa)),
    powers,
    ...[2, 5, 10, 20].map((k) => powers.filter((i) => ticks[i]!.exponent % k === 0)),
  ];
  return subsets.find((shown) => shown.length > 0 && apart(shown)) ?? [0];
}

// How many tick spacings apart labels must be to keep their centres `room` apart, by the narrowest
// spacing: the ticks of a linear axis are evenly spaced, and those of a square-root one closer the
// further they are from zero.
function everyFor(room: number, ticks: readonly number[], at: (value: number) => number): number {
  let narrowest = Infinity;
  for (let i = 1; i < ticks.length; i++) {
    narrowest = Math.min(narrowest, Math.abs(at(ticks[i]!) - at(ticks[i - 1]!)));
  }
  return Math.max(1, Math.ceil(room / narrowest));
}

/**
 * How many ticks an axis `length` long asks for: about one per 50 units, but no more than half the
 * most an axis may have, so that rounding out to a nice step never takes it past the most.
 */
export function tickCountFor(length: number): number {
  return Math.min(MAX_TICKS / 2, Math.max(2, Math.floor(length / TICK_SPACING)));
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

/** Multiples of a step a caller gave, as exact decimals: the multiples of its digits over a power of ten. */
function givenStep(step: number): TickStep {
  const decimals = decimalsOf(step);
  const power = POWERS[EXPONENT_OFFSET + decimals]!;
  const units = Math.round(step * power);
  const tick = (i: number): number => (i * units) / power;
  const nearest = (value: number): number => Math.round((value * power) / units);
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
    decimals,
    factor: 1,
  };
}

/**
 * The ticks to label when labels must be `every` tick spacings apart: those whose number is a
 * multiple of the smallest k of at least `every` that keeps the labelled step 1, 2 or 5 times a power
 * of ten, counted from zero, so a crowded step-2 axis shows 0, 10, 20 rather than 0, 6, 12. When no
 * tick is such a multiple, the one that is a multiple of the largest smaller k is labelled alone, and
 * when no spacing is enough (every tick at one place), the first.
 */
function labelledEvery(numbers: readonly number[], factor: number, every: number): number[] {
  const indices = numbers.map((_, i) => i);
  if (every <= 1) {
    return indices;
  }
  if (!Number.isFinite(every)) {
    return [0];
  }
  let alone: number[] = [];
  for (const k of niceMultiples(factor, Math.max(every, ...numbers.map(Math.abs)))) {
    const shown = indices.filter((i) => numbers[i]! % k === 0);
    if (k >= every && shown.length > 0) {
      return shown;
    }
    alone = shown.length > 0 ? [shown[0]!] : alone;
  }
  return alone.length > 0 ? alone : [0];
}

// The whole numbers k from 2 to `limit` that make `factor` × k 1, 2 or 5 times a power of ten,
// smallest first: three to a power of ten, however large the limit.
function niceMultiples(factor: number, limit: number): number[] {
  const found: number[] = [];
  for (let power = 1; power / factor <= limit; power *= 10) {
    for (const nice of [1, 2, 5]) {
      const k = (nice * power) / factor;
      if (Number.isInteger(k) && k >= 2 && k <= limit) {
        found.push(k);
      }
    }
  }
  return found;
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
  return formatNumber(value, format.decimals ?? Math.min(MAX_DECIMALS, decimalsOf(value)), format);
}

/** A share from 0 to 1 as a percentage, written with the share's own decimals less two: 0.07 is 7. */
export function formatShare(share: number): string {
  return formatNumber(share * 100, Math.min(MAX_DECIMALS, Math.max(0, decimalsOf(share) - 2)), PLAIN_FORMAT);
}

/** Raw data values keep the value axis' format, without a percent-stack suffix; times are written by formatTime. */
export function formatAxisValue(value: number, axis: CheckedLinearAxis): string {
  return axis.kind === 'time' ? formatTime(value) : formatValue(value, { ...axis.format, suffix: axis.percent ? '' : axis.format.suffix });
}
