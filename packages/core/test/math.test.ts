import { describe, expect, it } from 'vitest';
import { asin, atan } from '../src/inverse-trig.js';
import { cos, sin } from '../src/trig.js';

// The engine computes these with IEEE-exact operations only, so each value is the same in every
// JavaScript engine.
describe('engine trigonometry', () => {
  it.each<[string, (x: number) => number, number, number]>([
    ['sin of a large argument', sin, 1e6, -0.34999350217129294],
    ['cos of a large argument', cos, 1e6, 0.9367521275331447],
    ['sin near the end of the reduction range', sin, 1.5e6, 0.5109987142462677],
    ['atan between 0.4375 and 0.6875', atan, 0.5, 0.4636476090008061],
    ['atan between 0.6875 and 1.1875', atan, 0.8, 0.6747409422235527],
    ['atan between 1.1875 and 2.4375', atan, 1.5, 0.982793723247329],
    ['atan above 2.4375', atan, 3, 1.2490457723982544],
    ['atan of a large argument', atan, 1e3, 1.5697963271282298],
    ['asin close to 1', asin, 0.9999999, 1.5703491131957876],
    ['asin close to -1', asin, -0.99999999999, -1.5707918546587567],
  ])('computes %s', (_case, fn, x, expected) => {
    expect(fn(x)).toBe(expected);
  });

  it.each<[string, (x: number) => number]>([
    ['sin', sin],
    ['atan', atan],
    ['asin', asin],
  ])('keeps the sign of -0 in %s', (_name, fn) => {
    expect(fn(-0)).toBe(-0);
  });

  it.each<[number, number]>([
    [Infinity, Math.PI / 2],
    [-Infinity, -Math.PI / 2],
  ])('returns ±π/2 for atan(%s)', (x, expected) => {
    expect(atan(x)).toBe(expected);
  });
});
