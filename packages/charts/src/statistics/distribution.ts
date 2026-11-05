import { binGrid } from './bin-grid.js';
import { cos, log, sin, MAX_ANGLE } from '@borrowdale/core/math';
import { boolean, fail, list, MAX_VALUE, number, oneOf, text, type Fields } from '../read.js';
import { MARKER_SYMBOLS } from '../types.js';
import { readDisplay, DISTRIBUTIONS } from './types.js';
import {
  average,
  checkGeometry,
  deviation,
  dot,
  exp,
  grid,
  line,
  quantile,
  rect,
  type Glyph,
  type XY,
} from './geometry.js';

// Invert the normal upper-tail approximation by bisection. Mid-rank probabilities
// for at most 1,000 observations lie inside ±5 standard deviations.
function normalQuantile(p: number): number {
  if (p === 0.5) return 0;
  let low = 0,
    high = 5;
  const target = Math.min(p, 1 - p);
  for (let step = 0; step < 29; step++) {
    const x = (low + high) / 2,
      t = 1 / (1 + 0.2316419 * x);
    const tail =
      (exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)) *
      t *
      (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    if (tail > target) low = x;
    else high = x;
  }
  return ((p < 0.5 ? -1 : 1) * (low + high)) / 2;
}
export function readDistribution(r: Fields, path: string, reserve: (count: number) => void) {
  const display = readDisplay(r, DISTRIBUTIONS);
  const data = r.required('data', list(1, 1000, number(-MAX_VALUE, MAX_VALUE), reserve));
  const order = data.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const sorted = order.map((sample) => sample.value);
  const lo = sorted[0]!,
    hi = sorted.at(-1)!;
  const at = r.optional('position', number(-MAX_VALUE, MAX_VALUE)) ?? 0;
  const horizontal = r.optional('horizontal', boolean);
  const points = r.optional('points', boolean);
  const polar = r.optional('polar', boolean);
  if (polar && Math.abs(at) > MAX_ANGLE - 1)
    fail(`${path}.position`, `must leave the violin inside ±${MAX_ANGLE} radians`);
  const whiskers = r.optional('whiskers', oneOf(['minmax', 'tukey'] as const));
  const bandwidth = r.optional('bandwidth', number(Number.MIN_VALUE, MAX_VALUE));
  const mirrored = r.optional('mirrored', boolean) ?? true;
  const sizes = r.optional('sizes', list(data.length, data.length, number(1, 40)));
  const symbol = r.optional('symbol', oneOf(MARKER_SYMBOLS));
  const width = r.optional('binWidth', number(Number.MIN_VALUE, MAX_VALUE)) ?? 1;
  const marks: Glyph[] = [];
  const jitter = (i: number) => (((i * 0.6180339887498949) % 1) - 0.5) * 0.55;
  if (display === 'ecdf') {
    const steps: XY[] = [[lo, 0]];
    for (let i = 0; i < sorted.length; ) {
      const value = sorted[i]!;
      steps.push([value, i / sorted.length]);
      while (sorted[i] === value) i++;
      steps.push([value, i / sorted.length]);
    }
    marks.push(line('Empirical cumulative frequency', steps));
  } else if (display === 'normalQQ') {
    sorted.forEach((v, i) => marks.push(dot(String(v), normalQuantile((i + 0.5) / sorted.length), v)));
  } else if (display === 'box' || display === 'raincloud') {
    const q1 = quantile(sorted, 0.25),
      q3 = quantile(sorted, 0.75),
      median = quantile(sorted, 0.5);
    const iqr = q3 - q1;
    const min = whiskers === 'minmax' ? lo : sorted.find((v) => v >= q1 - 1.5 * iqr)!;
    const max = whiskers === 'minmax' ? hi : [...sorted].reverse().find((v) => v <= q3 + 1.5 * iqr)!;
    const half = display === 'box' ? 0.24 : 0.07;
    marks.push(
      line('Whiskers', [
        [at, min],
        [at, max],
      ]),
      rect('Interquartile range', at - half, q1, at + half, q3),
    );
    for (const v of [min, median, max])
      marks.push(
        line(String(v), [
          [at - half, v],
          [at + half, v],
        ]),
      );
    data.forEach((v, i) => {
      if (points || display === 'raincloud' || v < min || v > max) {
        marks.push(
          dot(
            String(v),
            at + (display === 'raincloud' ? 0.35 : 0) + (points || display === 'raincloud' ? jitter(i) / 2 : 0),
            v,
            4,
          ),
        );
      }
    });
  }
  if (['density', 'normal', 'violin', 'raincloud', 'ridge'].includes(display)) {
    const sd = data.length > 1 ? deviation(data, true) : 0;
    if (display === 'normal' && !sd) fail(path, 'needs sample variance above zero to fit a normal curve');
    const h = bandwidth ?? (sd ? 1.06 * sd * exp(-0.2 * log(data.length)) : Math.max(1, Math.abs(lo) * 0.01));
    const mean = average(data);
    const values = grid(
      display === 'normal' ? mean - 3 * sd : lo - 3 * h,
      display === 'normal' ? mean + 3 * sd : hi + 3 * h,
    );
    if (values.some((x, i) => i > 0 && x <= values[i - 1]!))
      fail(path, 'needs a bandwidth resolvable at the sample coordinates');
    const kernel = (z: number) => exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
    const density = values.map((v) =>
      display === 'normal'
        ? kernel((v - mean) / sd) / sd
        : data.reduce((s, d) => s + kernel((v - d) / h), 0) / (data.length * h),
    );
    const peak = Math.max(...density);
    if (display === 'density' || display === 'normal')
      marks.push(
        line(
          display,
          values.map((v, i) => [v, density[i]!]),
        ),
      );
    else if (display === 'ridge') {
      marks.push({
        kind: 'polygon',
        label: 'Density ridge',
        points: [[values[0]!, at], ...values.map((v, i): XY => [v, at + density[i]! / peak]), [values.at(-1)!, at]],
      });
    } else {
      const edge = values.map((v, i): XY => [at - (0.42 * density[i]!) / peak, v]);
      const other = values
        .map((v, i): XY => [at + (display === 'raincloud' ? 0 : (0.42 * density[i]!) / peak), v])
        .reverse();
      marks.unshift({ kind: 'polygon', label: 'Density envelope', points: [...edge, ...other] });
      if (points && display === 'violin') data.forEach((v, i) => marks.push(dot(String(v), at + jitter(i), v, 4)));
      if (polar) {
        const low = values[0]!,
          range = values.at(-1)! - low;
        for (const mark of marks)
          mark.points = mark.points.map(([angle, v]) => {
            const radius = 1 + (v - low) / range;
            return [radius * sin(angle), radius * cos(angle)];
          });
      }
    }
  }
  if (display === 'swarm') {
    for (const { value, index } of order) {
      marks.push({ ...dot(String(value), at, value, sizes?.[index] ?? 7), symbol: symbol ?? 'circle' });
    }
  }
  if (display === 'dotPlot' || display === 'isotype') {
    let anchor = sorted[0]!,
      group = binGrid(anchor, width),
      rank = 0;
    for (const value of sorted) {
      if (group.index(value, 'floor') >= 1) {
        anchor = value;
        group = binGrid(anchor, width);
        rank = 0;
      }
      if (!(group.edge(1) > anchor)) fail(path, 'needs a bin width resolvable at the sample coordinates');
      const offset = mirrored ? Math.ceil(rank / 2) * (rank % 2 ? 1 : -1) : rank;
      marks.push({
        ...dot(String(value), at + offset, anchor, 7),
        symbol: symbol ?? (display === 'isotype' ? 'star' : 'circle'),
      });
      rank++;
    }
  }
  if (display === 'stemLeaf') {
    const stems = new Map<number, number[]>();
    for (const v of sorted) {
      if (!Number.isInteger(v) || v < 0) fail(path, 'stem-and-leaf values must be nonnegative integers');
      const stem = Math.floor(v / 10);
      if (!stems.has(stem)) stems.set(stem, []);
      stems.get(stem)!.push(v % 10);
    }
    for (const [stem, leaves] of stems) {
      if (leaves.length > 450) fail(path, 'has more than 450 leaves on one stem');
      marks.push({ kind: 'text', label: `${stem} | ${leaves.join(' ')}`, points: [[0, -marks.length]] });
    }
  }
  if (horizontal) for (const mark of marks) mark.points = mark.points.map(([x, y]) => [y, x]);
  return {
    ...checkGeometry(path, marks),
    swarm: display === 'swarm' ? { horizontal: !!horizontal, mirrored } : undefined,
    densityStack: display === 'density' ? r.optional('stack', text()) : undefined,
  };
}
