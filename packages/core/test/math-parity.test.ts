import { beforeAll, describe, expect, it } from 'vitest';
import * as math from '@borrowdale/core/math';
import { ENGINES, evaluateIn } from './support/browsers.js';

// Computes the published functions at the same arguments in Chromium, Firefox and WebKit, and
// requires every result to be Node's, bit for bit: a function that called its engine's Math, or
// leaned on anything the engines round differently, would differ somewhere.

type PortableMath = typeof math;
type Results = { exp: number[]; log: number[]; sin: number[]; cos: number[]; acos: number[]; atan2: number[] };

// From a fixed sequence: for log, 500 positive numbers spread across the whole range of doubles, 500
// from 0.5 to 1.5, where its branches near 1 are, and two within 2^-30 of 1; for exp, 500 across its
// bound, 500 within ±0.345, where it takes no reduction, and two within 2^-30 of 0; for sin and cos,
// 500 numbers within their bound; for acos, 500 from -1 to 1, across its three branches at ±0.5, and
// both ends; for atan2, 500 pairs with y from -10 to 10 and x of either sign from 2^-31 to 2^20, which
// reach every quadrant, then pairs for its other branches: ratios beyond 2^60 and below 2^-60 with x
// negative, signed zeros for y and for x, and x = 1.
const fractions = Array.from({ length: 500 }, (_, i) => ((i * 7919) % 500) / 500 + 0.0005);
const ARGUMENTS = {
  log: [...fractions.map((f, i) => f * 2 ** ((i * 4) % 2046 - 1022)), ...fractions.map((f) => 0.5 + f), 1 + 2 ** -30, 1 - 2 ** -30],
  exp: [...fractions.map((f) => (f - 0.5) * 2 * math.MAX_EXPONENT), ...fractions.map((f) => (f - 0.5) * 0.69), 2 ** -30, -(2 ** -30)],
  trig: fractions.map((f, i) => (f - 0.5) * 2 * (i % 2 === 0 ? 10 : math.MAX_ANGLE)),
  acos: [...fractions.map((f) => (f - 0.5) * 2), 1, -1],
  y: [...fractions.map((f) => (f - 0.5) * 20), 1e300, 1, -1, 1e-300, -1e-300, 0, -0, 0, -0, 3, 1, -1],
  x: [...fractions.map((f, i) => (i % 2 === 0 ? 1 : -1) * f * 2 ** ((i % 41) - 20)), 1e-300, -1e-20, -1e-20, -1e300, -1e300, 2, 2, -2, -2, 1, 0, -0],
};

const compute = ({ log, exp, sin, cos, acos, atan2 }: PortableMath, args: typeof ARGUMENTS): Results => ({
  exp: args.exp.map(exp),
  log: args.log.map(log),
  sin: args.trig.map(sin),
  cos: args.trig.map(cos),
  acos: args.acos.map(acos),
  atan2: args.y.map((y, i) => atan2(y, args.x[i]!)),
});

const expected = compute(math, ARGUMENTS);

describe.each(ENGINES)('%s math parity', (engine) => {
  let computed: Results = { log: [], exp: [], sin: [], cos: [], acos: [], atan2: [] };

  beforeAll(async () => {
    computed = await evaluateIn(
      engine,
      new URL('../src/math.ts', import.meta.url),
      'borrowdaleMath',
      '',
      (args: typeof ARGUMENTS) => {
        const { log, exp, sin, cos, acos, atan2 } = (globalThis as unknown as { borrowdaleMath: PortableMath }).borrowdaleMath;
        return {
          exp: args.exp.map(exp),
          log: args.log.map(log),
          sin: args.trig.map(sin),
          cos: args.trig.map(cos),
          acos: args.acos.map(acos),
          atan2: args.y.map((y, i) => atan2(y, args.x[i]!)),
        };
      },
      ARGUMENTS,
    );
  }, 120_000);

  it.each(['log', 'exp', 'sin', 'cos', 'acos', 'atan2'] as const)(`computes %s at every argument as Node does in ${engine}`, (name) => {
    expect(computed[name]).toEqual(expected[name]);
  });
});
