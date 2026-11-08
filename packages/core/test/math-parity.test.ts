import { beforeAll, describe, expect, it } from 'vitest';
import * as math from '@borrowdale/core/math';
import { ENGINES, evaluateIn } from './support/browsers.js';

// Computes the published functions at the same arguments in Chromium, Firefox and WebKit, and
// requires every result to be Node's, bit for bit: a function that called its engine's Math, or
// leaned on anything the engines round differently, would differ somewhere.

type PortableMath = typeof math;
type Results = { exp: number[]; log: number[]; sin: number[]; cos: number[] };

// From a fixed sequence: for log, 500 positive numbers spread across the whole range of doubles, 500
// from 0.5 to 1.5, where its branches near 1 are, and two within 2^-30 of 1; for exp, 500 across its
// bound, 500 within ±0.345, where it takes no reduction, and two within 2^-30 of 0; for sin and cos,
// 500 numbers within their bound.
const fractions = Array.from({ length: 500 }, (_, i) => ((i * 7919) % 500) / 500 + 0.0005);
const ARGUMENTS = {
  log: [...fractions.map((f, i) => f * 2 ** ((i * 4) % 2046 - 1022)), ...fractions.map((f) => 0.5 + f), 1 + 2 ** -30, 1 - 2 ** -30],
  exp: [...fractions.map((f) => (f - 0.5) * 2 * math.MAX_EXPONENT), ...fractions.map((f) => (f - 0.5) * 0.69), 2 ** -30, -(2 ** -30)],
  trig: fractions.map((f, i) => (f - 0.5) * 2 * (i % 2 === 0 ? 10 : math.MAX_ANGLE)),
};

const compute = ({ log, exp, sin, cos }: Pick<PortableMath, 'log' | 'exp' | 'sin' | 'cos'>, args: typeof ARGUMENTS): Results => ({
  exp: args.exp.map(exp),
  log: args.log.map(log),
  sin: args.trig.map(sin),
  cos: args.trig.map(cos),
});

const expected = compute(math, ARGUMENTS);

describe.each(ENGINES)('%s math parity', (engine) => {
  let computed: Results = { log: [], exp: [], sin: [], cos: [] };

  beforeAll(async () => {
    computed = await evaluateIn(
      engine,
      new URL('../src/math.ts', import.meta.url),
      'borrowdaleMath',
      '',
      (args: typeof ARGUMENTS) => {
        const { log, exp, sin, cos } = (globalThis as unknown as { borrowdaleMath: PortableMath }).borrowdaleMath;
        return { exp: args.exp.map(exp), log: args.log.map(log), sin: args.trig.map(sin), cos: args.trig.map(cos) };
      },
      ARGUMENTS,
    );
  }, 120_000);

  it.each(['log', 'exp', 'sin', 'cos'] as const)(`computes %s at every argument as Node does in ${engine}`, (name) => {
    expect(computed[name]).toEqual(expected[name]);
  });
});
