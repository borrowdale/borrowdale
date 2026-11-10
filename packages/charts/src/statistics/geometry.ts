import { exp as portableExp, MAX_EXPONENT } from '@borrowdale/core/math';
import type { Role } from '../palette.js';
import { fail, MAX_VALUE } from '../read.js';
import type { MarkerSymbol } from '../types.js';

export type XY = [number, number];

export type Glyph = {
  /**
   * `valueText`, such as a point-and-figure X, is centred on its point and never moved: the axes keep
   * room for half its size, as for a dot. `dataLabel` is placed as a data label is, moved inside the
   * plot. `row` is a line of text starting at the plot's left edge, at its point's level, and must fit
   * across the plot; its x is kept at 0 and still counts on the x axis.
   */
  kind: 'line' | 'polygon' | 'dot' | 'valueText' | 'dataLabel' | 'row';
  points: XY[];
  /**
   * The mark's tooltip, and for the three text kinds also the text drawn. In the tooltip only, `{0}`,
   * `{1}`… stand for `values`, written in the format of the `along` axis.
   */
  label: string;
  /** Axis values named in the label, so the tooltip uses the axis format. */
  values?: number[];
  /** The axis of `values`; y when left out. */
  along?: 'x' | 'y';
  /** How the mark is painted from its series' paint. */
  role?: Role;
  /** A count cell's share of the largest count, 0 to 1. */
  weight?: number;
  size?: number;
  symbol?: MarkerSymbol;
  hollow?: boolean;
};

export function line(label: string, points: XY[], role?: Role): Glyph {
  return { kind: 'line', label, points, ...(role && { role }) };
}

export function rect(label: string, x1: number, y1: number, x2: number, y2: number): Glyph {
  return {
    kind: 'polygon',
    label,
    points: [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ],
  };
}

export function dot(label: string, x: number, y: number, size = 6): Glyph {
  return { kind: 'dot', label, points: [[x, y]], size };
}

/** `glyph` with its label naming `values` on the value axis. */
export function valued<G extends Glyph>(glyph: G, values: number[]): G {
  return { ...glyph, values };
}

/** The label with its values written by `write`. */
export function labelOf(glyph: Glyph, write: (value: number) => string): string {
  const values = glyph.values;
  return values ? glyph.label.replace(/\{(\d)\}/g, (_, i: string) => write(values[Number(i)]!)) : glyph.label;
}

/** Rejects a series whose points reach past the drawable range. */
export function checkDrawable(path: string, points: readonly XY[]): void {
  if (points.some((pair) => pair.some((v) => !(Math.abs(v) <= MAX_VALUE)))) {
    fail(path, 'produces coordinates outside the drawable range');
  }
}

/**
 * The marks of a series, once every coordinate is drawable. Every point they draw counts toward the
 * chart's point budget, as the observations they come from already do.
 */
export function checkGeometry(path: string, marks: Glyph[], reserve: (count: number) => void): { marks: Glyph[] } {
  for (const mark of marks) checkDrawable(path, mark.points);
  reserve(marks.reduce((count, mark) => count + mark.points.length, 0));
  return { marks };
}

/**
 * Core's portable `exp`, extended past its ±MAX_EXPONENT: Gaussian tails below the smallest double
 * vanish to zero, and an overflowing fit is Infinity, which `checkGeometry` rejects.
 */
export function exp(x: number): number {
  if (x < -745.2) return 0;
  if (x < -MAX_EXPONENT) return portableExp(x + 40) * portableExp(-40);
  if (x > MAX_EXPONENT) return Infinity;
  return Number.isNaN(x) ? NaN : portableExp(x);
}

/** The standard normal density at `z`. */
export function gaussian(z: number): number {
  return exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
}

/** Whether every value exceeds the one before it. */
export function increasing(values: readonly number[]): boolean {
  return values.every((value, i) => i === 0 || value > values[i - 1]!);
}

export function average(values: readonly number[]): number {
  const first = values[0]!;
  if (values.every((value) => value === first)) return first;
  let sum = 0, correction = 0;
  for (const value of values) {
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value) ? (sum - next) + value : (value - next) + sum;
    sum = next;
  }
  return (sum + correction) / values.length;
}

export function quantile(sorted: readonly number[], p: number): number {
  const index = p * (sorted.length - 1);
  const lower = sorted[Math.floor(index)]!;
  return lower + (sorted[Math.ceil(index)]! - lower) * (index - Math.floor(index));
}

export function deviation(values: readonly number[], sample = false): number {
  const mean = average(values);
  const scale = values.reduce((largest, value) => Math.max(largest, Math.abs(value - mean)), 0);
  if (scale === 0) return 0;
  const divisor = values.length - (sample ? 1 : 0);
  // A product, not `** 2`: exponentiation may be approximated differently by each engine.
  const squared = values.reduce((sum, value) => {
    const offset = (value - mean) / scale;
    return sum + offset * offset;
  }, 0);
  return scale * Math.sqrt(squared / divisor);
}

export function grid(low: number, high: number, count = 65): number[] {
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? high : low + ((high - low) * i) / (count - 1)));
}
