import { exp as portableExp, MAX_EXPONENT } from '@borrowdale/core/math';
import type { MarkerSymbol } from '../types.js';
import { fail, MAX_VALUE } from '../read.js';

export type XY = [number, number];
export type Glyph = {
  kind: 'line' | 'polygon' | 'dot' | 'text';
  points: XY[];
  label: string;
  color?: string;
  fillColor?: string;
  size?: number;
  symbol?: MarkerSymbol;
  hollow?: boolean;
};
export function line(label: string, points: XY[], color?: string): Glyph {
  return { kind: 'line', label, points, ...(color && { color }) };
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
export function checkGeometry(path: string, marks: Glyph[]): { marks: Glyph[] } {
  for (const mark of marks) {
    if (mark.points.some((pair) => pair.some((v) => !(Math.abs(v) <= MAX_VALUE)))) {
      fail(path, 'produces coordinates outside the drawable range');
    }
  }
  return { marks };
}

// Outside core's guaranteed range Gaussian tails vanish; overflowing fits are rejected by checkGeometry.
export function exp(x: number): number {
  if (x < -745.2) return 0;
  if (x < -MAX_EXPONENT) return portableExp(x + 40) * portableExp(-40);
  if (x > MAX_EXPONENT) return Infinity;
  return Number.isNaN(x) ? NaN : portableExp(x);
}
export function average(values: readonly number[]): number {
  const first = values[0]!;
  if (values.every(value => value === first)) return first;
  let sum = 0, correction = 0;
  for (const value of values) {
    const next = sum + value;
    correction += Math.abs(sum) >= Math.abs(value) ? (sum-next)+value : (value-next)+sum;
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
  const squared = values.reduce((sum, value) => sum + ((value - mean) / scale) ** 2, 0);
  return scale * Math.sqrt(squared / divisor);
}
export function grid(low: number, high: number, count = 65): number[] {
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? high : low + ((high - low) * i) / (count - 1)));
}
