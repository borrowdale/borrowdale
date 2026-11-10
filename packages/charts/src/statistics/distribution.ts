import { cos, log, MAX_ANGLE, sin } from '@borrowdale/core/math';
import { boolean, fail, list, MAX_VALUE, number, oneOf, text, type Fields } from '../read.js';
import { MARKER_SYMBOLS, type MarkerSymbol } from '../types.js';
import { binGrid } from './bin-grid.js';
import {
  average,
  checkDrawable,
  checkGeometry,
  deviation,
  dot,
  exp,
  gaussian,
  grid,
  increasing,
  labelOf,
  line,
  quantile,
  rect,
  valued,
  type Glyph,
  type XY,
} from './geometry.js';
import { DISTRIBUTIONS, readDisplay, unhandled } from './types.js';

// The standard normal quantile, by bisection on the upper-tail approximation. Mid-rank probabilities
// for at most 1,000 observations lie inside ±5 standard deviations.
function normalQuantile(p: number): number {
  if (p === 0.5) return 0;
  let low = 0, high = 5;
  const target = Math.min(p, 1 - p);
  for (let step = 0; step < 29; step++) {
    const x = (low + high) / 2, t = 1 / (1 + 0.2316419 * x);
    const tail =
      gaussian(x) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    if (tail > target) low = x;
    else high = x;
  }
  return ((p < 0.5 ? -1 : 1) * (low + high)) / 2;
}

/** The most points a kernel density curve is drawn with. */
const MAX_DENSITY_POINTS = 2_000;

// KDE points: 65 across the samples and three bandwidths past each end, refined to at most a
// quarter bandwidth apart within three bandwidths of every sample. A sample's peak then lies at
// most an eighth of a bandwidth from a drawn point, so no isolated peak is drawn more than 1% low.
function densityGrid(path: string, sorted: readonly number[], h: number, given: boolean): number[] {
  const low = sorted[0]!, high = sorted.at(-1)!;
  const values = grid(low - 3 * h, high + 3 * h);
  const step = h / 4;
  if ((high + 3 * h - (low - 3 * h)) / (values.length - 1) <= step) {
    if (!increasing(values)) fail(path, 'needs a bandwidth resolvable at the sample coordinates');
    return values;
  }
  const runs: [number, number][] = [];
  for (const sample of sorted) {
    const last = runs.at(-1);
    if (last && sample - 3 * h <= last[1]) last[1] = sample + 3 * h;
    else runs.push([sample - 3 * h, sample + 3 * h]);
  }
  // A bandwidth too small for a sample's magnitude leaves its run, or the step, without width.
  if (!(step > 0) || runs.some(([from, to]) => !(to > from))) {
    fail(path, 'needs a bandwidth resolvable at the sample coordinates');
  }
  const counts = runs.map(([from, to]) => Math.ceil((to - from) / step) + 1);
  const total = counts.reduce((sum, count) => sum + count, values.length);
  if (!(total <= MAX_DENSITY_POINTS)) {
    const problem = `its density needs ${total} points, more than ${MAX_DENSITY_POINTS}`;
    if (given) fail(`${path}.bandwidth`, `is ${h}, too narrow for the sample range: ${problem}`);
    fail(path, `needs a bandwidth: the default ${h} is too narrow for the sample range, and ${problem}`);
  }
  const points = [...values];
  runs.forEach(([from, to], i) => {
    const run = grid(from, to, counts[i]);
    if (!increasing(run)) fail(path, 'needs a bandwidth resolvable at the sample coordinates');
    points.push(...run);
  });
  points.sort((a, b) => a - b);
  return points.filter((x, i) => i === 0 || x !== points[i - 1]);
}

/** A density sampled at increasing values, and its largest height. */
interface Curve {
  values: number[];
  density: number[];
  peak: number;
}

function curve(values: number[], density: number[]): Curve {
  return { values, density, peak: Math.max(...density) };
}

// A Gaussian kernel density estimate. The default bandwidth is Silverman's rule of thumb; a
// constant sample takes one unit or one percent of its value, whichever is larger.
// The grid counts toward the point budget before the kernel sum, the costly part, is computed.
function kernelDensity(
  path: string,
  data: readonly number[],
  sorted: readonly number[],
  bandwidth: number | undefined,
  reserve: (count: number) => void,
): Curve {
  const sd = data.length > 1 ? deviation(data, true) : 0;
  const h = bandwidth ?? (sd ? 1.06 * sd * exp(-0.2 * log(data.length)) : Math.max(1, Math.abs(sorted[0]!) * 0.01));
  const values = densityGrid(path, sorted, h, bandwidth !== undefined);
  reserve(values.length);
  const result = curve(
    values,
    values.map((v) => data.reduce((s, d) => s + gaussian((v - d) / h), 0) / (data.length * h)),
  );
  // A bandwidth too small for the samples' magnitude overflows the density.
  if (!(result.peak < Infinity)) fail(path, 'needs a bandwidth resolvable at the sample coordinates');
  return result;
}

// The normal curve with the sample mean and sample standard deviation, over three deviations each side.
function normalDensity(path: string, data: readonly number[]): Curve {
  const sd = data.length > 1 ? deviation(data, true) : 0;
  if (!sd) fail(path, 'needs sample variance above zero to fit a normal curve');
  const mean = average(data);
  const values = grid(mean - 3 * sd, mean + 3 * sd);
  if (!increasing(values)) fail(path, 'needs a sample spread resolvable at the sample coordinates');
  return curve(
    values,
    values.map((v) => gaussian((v - mean) / sd) / sd),
  );
}

function curvePoints({ values, density }: Curve): XY[] {
  return values.map((v, i) => [v, density[i]!]);
}

// A violin's outline, the density mirrored about `at`; one-sided for a raincloud.
function envelope({ values, density, peak }: Curve, at: number, oneSided: boolean): Glyph {
  const edge = values.map((v, i): XY => [at - (0.42 * density[i]!) / peak, v]);
  const other = values.map((v, i): XY => [at + (oneSided ? 0 : (0.42 * density[i]!) / peak), v]).reverse();
  return { kind: 'polygon', label: 'Density envelope', points: [...edge, ...other] };
}

// A ridge rising from its group position to unit height at its peak.
function ridge({ values, density, peak }: Curve, at: number): Glyph {
  return {
    kind: 'polygon',
    label: 'Density ridge',
    points: [[values[0]!, at], ...values.map((v, i): XY => [v, at + density[i]! / peak]), [values.at(-1)!, at]],
  };
}

// A polar violin: `at` is the angle and the density's range maps to radius 1 to 2. No axis measures a
// polar sample, so its tooltips write the value as given.
function toPolar(marks: Glyph[], { values }: Curve): void {
  const low = values[0]!, range = values.at(-1)! - low;
  for (const mark of marks) {
    mark.points = mark.points.map(([angle, v]) => {
      const radius = 1 + (v - low) / range;
      return [radius * sin(angle), radius * cos(angle)];
    });
    mark.label = labelOf(mark, String);
    delete mark.values;
  }
}

// A fixed sideways spread for drawn samples, the same for every engine.
function jitter(i: number): number {
  return (((i * 0.6180339887498949) % 1) - 0.5) * 0.55;
}

interface BoxStyle {
  /** Half the box width. */
  half: number;
  /** How far the drawn samples sit beside the box. */
  shift: number;
  /** Draw every sample, jittered; otherwise only the samples outside the whiskers. */
  every: boolean;
  whiskers: 'minmax' | 'tukey' | undefined;
}

// Interpolated quartiles and median. Tukey whiskers reach the outermost samples within 1.5 IQR, and
// at least to the quartiles: in a small sample the nearest one inside a fence can lie within the box.
function boxGlyphs(data: readonly number[], sorted: readonly number[], at: number, style: BoxStyle): Glyph[] {
  const { half, shift, every, whiskers } = style;
  const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75), median = quantile(sorted, 0.5);
  const iqr = q3 - q1;
  const min = whiskers === 'minmax' ? sorted[0]! : Math.min(q1, sorted.find((v) => v >= q1 - 1.5 * iqr)!);
  const max = whiskers === 'minmax' ? sorted.at(-1)! : Math.max(q3, [...sorted].reverse().find((v) => v <= q3 + 1.5 * iqr)!);
  const marks: Glyph[] = [
    line('Whiskers', [
      [at, min],
      [at, max],
    ]),
    rect('Interquartile range', at - half, q1, at + half, q3),
    ...[min, median, max].map((v) =>
      valued(
        line('{0}', [
          [at - half, v],
          [at + half, v],
        ]),
        [v],
      ),
    ),
  ];
  data.forEach((v, i) => {
    if (every || v < min || v > max) marks.push(valued(dot('{0}', at + shift + (every ? jitter(i) / 2 : 0), v, 4), [v]));
  });
  return marks;
}

// Exact empirical steps at each distinct sample.
function ecdf(sorted: readonly number[]): Glyph {
  const steps: XY[] = [];
  for (let i = 0; i < sorted.length; ) {
    const value = sorted[i]!;
    steps.push([value, i / sorted.length]);
    while (sorted[i] === value) i++;
    steps.push([value, i / sorted.length]);
  }
  return line('Empirical cumulative frequency', steps);
}

// Dots stacked by value: each group starts at the smallest remaining sample and spans `width`.
function dotGroups(
  path: string,
  sorted: readonly number[],
  at: number,
  width: number,
  mirrored: boolean,
  symbol: MarkerSymbol,
): Glyph[] {
  const marks: Glyph[] = [];
  let group: ReturnType<typeof binGrid> | undefined;
  let anchor = 0, rank = 0;
  for (const value of sorted) {
    if (!group || group.index(value, 'floor') >= 1) {
      anchor = value;
      group = binGrid(anchor, width);
      rank = 0;
      if (!(group.edge(1) > anchor)) fail(path, 'needs a bin width resolvable at the sample coordinates');
    }
    const offset = mirrored ? Math.ceil(rank / 2) * (rank % 2 ? 1 : -1) : rank;
    marks.push({ ...valued(dot('{0}', at + offset, anchor, 7), [value]), symbol });
    rank++;
  }
  return marks;
}

/** How far a swarm may spread from its group position on each side, in group-axis units. */
const SWARM_ROOM = 0.5;

// A swarm spreads on screen, not in data, so its group axis keeps room for it as a box or violin does
// for its width: half a unit each side of the group position, or on the side a one-sided swarm
// grows. These points only widen the axes; nothing is drawn at them.
function swarmRoom(path: string, at: number, value: number, mirrored: boolean, horizontal: boolean | undefined): XY[] {
  const room = [mirrored ? at - SWARM_ROOM : at, at + SWARM_ROOM].map((side): XY => (horizontal ? [value, side] : [side, value]));
  checkDrawable(path, room);
  return room;
}

/** The most stems a stem-and-leaf display has, each a row of text. */
const MAX_STEMS = 100;

// One text row per tens stem from the lowest to the highest, empty stems included, so gaps show.
// 450 leaves keep a row within the 1,000 characters text lays out.
function stemLeaf(path: string, sorted: readonly number[]): Glyph[] {
  const stems = new Map<number, number[]>();
  for (const v of sorted) {
    if (!Number.isInteger(v) || v < 0) fail(path, 'stem-and-leaf values must be nonnegative integers');
    const stem = Math.floor(v / 10);
    const leaves = stems.get(stem) ?? [];
    leaves.push(v % 10);
    stems.set(stem, leaves);
  }
  const first = Math.floor(sorted[0]! / 10);
  const count = Math.floor(sorted.at(-1)! / 10) - first + 1;
  if (count > MAX_STEMS) fail(path, `spans more than ${MAX_STEMS} stems`);
  return Array.from({ length: count }, (_, row): Glyph => {
    const leaves = stems.get(first + row) ?? [];
    if (leaves.length > 450) fail(path, 'has more than 450 leaves on one stem');
    const label = leaves.length ? `${first + row} | ${leaves.join(' ')}` : `${first + row} |`;
    return { kind: 'row', label, points: [[0, -row]] };
  });
}

export function readDistribution(r: Fields, path: string, reserve: (count: number) => void) {
  const display = readDisplay(r, DISTRIBUTIONS);
  const data = r.required('data', list(1, 1000, number(-MAX_VALUE, MAX_VALUE), reserve));
  const order = data.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const sorted = order.map((sample) => sample.value);
  const at = r.optional('position', number(-MAX_VALUE, MAX_VALUE)) ?? 0;
  const horizontal = r.optional('horizontal', boolean);
  const points = r.optional('points', boolean);
  const polar = r.optional('polar', boolean);
  if (polar && Math.abs(at) > MAX_ANGLE - 1) {
    fail(`${path}.position`, `must leave the violin inside ±${MAX_ANGLE} radians`);
  }
  if (polar && horizontal) fail(path, 'cannot combine polar and horizontal');
  const whiskers = r.optional('whiskers', oneOf(['minmax', 'tukey'] as const));
  const bandwidth = r.optional('bandwidth', number(Number.MIN_VALUE, MAX_VALUE));
  const mirrored = r.optional('mirrored', boolean) ?? true;
  const sizes = r.optional('sizes', list(data.length, data.length, number(1, 40)));
  const symbol = r.optional('symbol', oneOf(MARKER_SYMBOLS));
  const width = r.optional('binWidth', number(Number.MIN_VALUE, MAX_VALUE)) ?? 1;
  const stack = r.optional('stack', text());
  let marks: Glyph[];
  let densityStack: { key: string; curve: XY[] } | undefined;
  switch (display) {
    case 'ecdf':
      marks = [ecdf(sorted)];
      break;
    case 'normalQQ':
      marks = sorted.map((v, i) => valued(dot('{0}', normalQuantile((i + 0.5) / sorted.length), v), [v]));
      break;
    case 'box':
      marks = boxGlyphs(data, sorted, at, { half: 0.24, shift: 0, every: !!points, whiskers });
      break;
    case 'raincloud':
      marks = [
        envelope(kernelDensity(path, data, sorted, bandwidth, reserve), at, true),
        ...boxGlyphs(data, sorted, at, { half: 0.07, shift: 0.35, every: true, whiskers }),
      ];
      break;
    case 'violin': {
      const density = kernelDensity(path, data, sorted, bandwidth, reserve);
      const samples = points ? data.map((v, i) => valued(dot('{0}', at + jitter(i), v, 4), [v])) : [];
      marks = [envelope(density, at, false), ...samples];
      if (polar) toPolar(marks, density);
      break;
    }
    case 'density': {
      const curve = curvePoints(kernelDensity(path, data, sorted, bandwidth, reserve));
      // A stacked density is drawn as its layer of the stack, which the chart builds once every
      // series is read (stackDensities).
      if (stack === undefined) marks = [line('density', curve)];
      else {
        checkDrawable(path, curve);
        marks = [];
        densityStack = { key: stack, curve };
      }
      break;
    }
    case 'normal':
      marks = [line('normal', curvePoints(normalDensity(path, data)))];
      break;
    case 'ridge':
      marks = [ridge(kernelDensity(path, data, sorted, bandwidth, reserve), at)];
      break;
    case 'swarm':
      marks = order.map(({ value, index }) => ({
        ...valued(dot('{0}', at, value, sizes?.[index] ?? 7), [value]),
        symbol: symbol ?? 'circle',
      }));
      break;
    case 'dotPlot':
    case 'isotype':
      marks = dotGroups(path, sorted, at, width, mirrored, symbol ?? (display === 'isotype' ? 'star' : 'circle'));
      break;
    case 'stemLeaf':
      marks = stemLeaf(path, sorted);
      break;
    default:
      return unhandled(display);
  }
  if (horizontal) {
    for (const mark of marks) {
      mark.points = mark.points.map(([x, y]) => [y, x]);
      if (mark.values) mark.along = 'x';
    }
  }
  return {
    ...checkGeometry(path, marks, reserve),
    swarm: display === 'swarm' ? { mirrored, room: swarmRoom(path, at, sorted[0]!, mirrored, horizontal) } : undefined,
    densityStack,
  };
}
