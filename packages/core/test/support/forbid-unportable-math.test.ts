import { describe, expect, it } from 'vitest';
import { EXACT, UNPORTABLE } from './forbid-unportable-math.js';

type MathFunction = (...args: number[]) => number;

// Every function Math has in this runtime, and the two lists sorted together. A Math function added
// by a later runtime must be classified before the guard can be trusted.
const MATH_FUNCTIONS = Object.getOwnPropertyNames(Math)
  .filter((name) => typeof (Math as unknown as Record<string, unknown>)[name] === 'function')
  .sort();
const CLASSIFIED = [...UNPORTABLE, ...EXACT].sort();

describe('the unportable-Math guard', () => {
  it('classifies every Math function as unportable or exact', () => {
    expect(MATH_FUNCTIONS).toEqual(CLASSIFIED);
  });

  it.each(UNPORTABLE)('makes Math.%s throw', (name) => {
    expect(() => (Math[name] as MathFunction)(1, 1)).toThrow(`Math.${name}() called while drawing`);
  });

  it.each<[string, number[], number]>([
    ['abs', [-4], 4],
    ['floor', [4.5], 4],
    ['sqrt', [4], 2],
    ['imul', [4, 2], 8],
    ['round', [2.5], 3],
  ])('leaves Math.%s working', (name, args, expected) => {
    expect((Math[name as keyof Math] as MathFunction)(...args)).toBe(expected);
  });
});
