import { beforeAll, describe, expect, it } from 'vitest';
import * as math from '@borrowdale/core/math';
import { ENGINES, evaluateIn } from './support/browsers.js';

// Computes the published functions at the same 1,500 arguments in Chromium, Firefox and WebKit, and
// requires every result to be Node's, bit for bit: a function that called its engine's Math, or
// leaned on anything the engines round differently, would differ somewhere.

type Math = typeof math;
type Results = { log: number[]; sin: number[]; cos: number[] };

// 500 arguments of each kind, from a fixed sequence: positive numbers across the whole range for
// log, and numbers within their bound for sin and cos.
const fractions = Array.from({ length: 500 }, (_, i) => ((i * 7919) % 500) / 500 + 0.0005);
const ARGUMENTS = {
  log: fractions.map((f, i) => f * 2 ** (i % 2046 - 1022)),
  trig: fractions.map((f, i) => (f - 0.5) * 2 * (i % 2 === 0 ? 10 : math.MAX_ANGLE)),
};

const compute = ({ log, sin, cos }: Pick<Math, 'log' | 'sin' | 'cos'>, args: typeof ARGUMENTS): Results => ({
  log: args.log.map(log),
  sin: args.trig.map(sin),
  cos: args.trig.map(cos),
});

const expected = compute(math, ARGUMENTS);

describe.each(ENGINES)('%s math parity', (engine) => {
  let computed: Results = { log: [], sin: [], cos: [] };

  beforeAll(async () => {
    computed = await evaluateIn(
      engine,
      new URL('../src/math.ts', import.meta.url),
      'borrowdaleMath',
      '',
      (args: typeof ARGUMENTS) => {
        const { log, sin, cos } = (globalThis as unknown as { borrowdaleMath: Math }).borrowdaleMath;
        return { log: args.log.map(log), sin: args.trig.map(sin), cos: args.trig.map(cos) };
      },
      ARGUMENTS,
    );
  }, 120_000);

  it.each(['log', 'sin', 'cos'] as const)(`computes %s at 500 arguments as Node does in ${engine}`, (name) => {
    expect(computed[name]).toEqual(expected[name]);
  });
});
