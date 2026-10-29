import { describe, expect, it } from 'vitest';
import { Budget, sketch, type Shape } from '@borrowdale/core';
import { charge, drawWithin, MAX_OPERATIONS } from '../src/engine/budget.js';

// One unit per stroke, and rough draws a line with two.
const line: Shape = { kind: 'line', x1: 0, y1: 0, x2: 10, y2: 10 };
// An arc so thin that rough's sampling makes it about 200,000 work units.
const thinArc: Shape = { kind: 'arc', cx: 50, cy: 50, width: 80, height: 80, start: 0, stop: 1e-6, closed: true };
// 20,000 chained curves, whose fill outline has more points than an engine takes as arguments to one call.
const longChain: Shape = {
  kind: 'path',
  d: `M0 0${Array.from({ length: 20_000 }, (_, i) => ` C${(i * 3 + 1) % 1000} 50 ${(i * 3 + 2) % 1000} -50 ${(i * 3 + 3) % 1000} 0`).join('')}`,
};
// An object that claims to be a Budget without being made by its constructor.
const pretend = Object.create(Budget.prototype) as Budget;
const fake = { maxOperations: 10, spent: 0 } as unknown as Budget;

/** Charges `count` units inside a drawing on `budget`, as the engine does. */
function chargeWithin(budget: Budget, count: number): void {
  drawWithin(budget, () => charge(count));
}

/** Starts a drawing on `budget` that throws. */
function failWithin(budget: Budget): void {
  drawWithin(budget, () => {
    throw new Error('drawing failed');
  });
}

/** Charges `count` units to a drawing on `outer`, after a drawing on `inner` inside it has thrown. */
function chargeAfterFailedInner(outer: Budget, inner: Budget, count: number): void {
  drawWithin(outer, () => {
    expect(() => failWithin(inner)).toThrow('drawing failed');
    charge(count);
  });
}
// A shape that starts another drawing each time the engine reads its end.
const reentrant = {
  kind: 'line' as const,
  x1: 0,
  y1: 0,
  x2: 10,
  get y2(): number {
    sketch(line);
    return 10;
  },
};

// The error promises "more than" the limit, so exactly the limit must still be allowed.
describe('work budget', () => {
  it('allows exactly the limit', () => {
    expect(() => chargeWithin(new Budget(MAX_OPERATIONS), MAX_OPERATIONS)).not.toThrow();
  });

  it('throws on the first unit past the limit', () => {
    const budget = new Budget(MAX_OPERATIONS);
    chargeWithin(budget, MAX_OPERATIONS);

    expect(() => chargeWithin(budget, 1)).toThrow(`Drawing too complex (more than ${MAX_OPERATIONS} operations)`);
  });

  it('refuses work charged outside a drawing', () => {
    expect(() => charge(1)).toThrow('The engine charged work outside a drawing');
  });

  it('ends a drawing that throws', () => {
    expect(() => failWithin(new Budget(10))).toThrow('drawing failed');
    expect(() => charge(1)).toThrow('The engine charged work outside a drawing');
  });

  it('returns to the outer drawing when an inner one throws', () => {
    const outer = new Budget(10);
    const inner = new Budget(10);

    chargeAfterFailedInner(outer, inner, 3);

    expect([outer.spent, inner.spent]).toEqual([3, 0]);
  });
});

describe('a budget shared by several sketch() calls', () => {
  it('counts the work of every call it is passed to', () => {
    const budget = new Budget(100);

    sketch(line, {}, budget);
    sketch(line, {}, budget);

    expect(budget.spent).toBe(4);
  });

  it('allows calls whose total is exactly the limit', () => {
    const budget = new Budget(4);
    sketch(line, {}, budget);

    expect(() => sketch(line, {}, budget)).not.toThrow();
  });

  it('throws in the call that takes the total past the limit', () => {
    const budget = new Budget(3);
    sketch(line, {}, budget);

    expect(() => sketch(line, {}, budget)).toThrow('Drawing too complex (more than 3 operations)');
  });

  it('offers callers no way to charge or refund work, only to read what was spent', () => {
    expect(Object.getOwnPropertyNames(Budget.prototype)).toEqual(['constructor', 'maxOperations', 'spent']);
  });

  it('has no static members that could reach a budget', () => {
    expect(Object.getOwnPropertyNames(Budget)).toEqual(['length', 'name', 'prototype']);
  });

  it('keeps its limit fixed', () => {
    expect(() => Object.assign(new Budget(3), { maxOperations: 1e9 })).toThrow(TypeError);
  });

  it('rejects maxOperations given as an object that cannot become a string, by its kind', () => {
    expect(() => new Budget(Object.create(null) as number)).toThrow(
      'Invalid budget: maxOperations must be a whole number from 1 to 9007199254740991, got object',
    );
  });

  it('draws as much as a large budget allows, whatever the engine stack', () => {
    expect(sketch(thinArc, { seed: 1, fill: 'red', fillStyle: 'solid' }, new Budget(1_000_000)).paths).toHaveLength(2);
  });

  it('fills a long chain of curves until the budget runs out, whatever the engine stack', () => {
    expect(() => sketch(longChain, { fill: 'red', fillStyle: 'solid' }, new Budget(10_000_000))).toThrow(
      'Drawing too complex (more than 10000000 operations)',
    );
  });

  it('rejects an object that only inherits from Budget', () => {
    expect(() => sketch(line, {}, pretend)).toThrow('Invalid budget: must be a Budget made with new Budget(), or nothing');
  });

  it('charges a drawing to its own budget even when a shape starts another drawing', () => {
    const budget = new Budget(100);

    sketch(reentrant, {}, budget);

    expect(budget.spent).toBe(2);
  });

  it('leaves a later call without a budget its own full budget', () => {
    const budget = new Budget(2);
    sketch(line, {}, budget);

    expect(() => sketch({ kind: 'rectangle', x: 0, y: 0, width: 10, height: 10 })).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])('rejects maxOperations %s', (maxOperations) => {
    expect(() => new Budget(maxOperations)).toThrow(
      `Invalid budget: maxOperations must be a whole number from 1 to 9007199254740991, got ${maxOperations}`,
    );
  });

  it('rejects maxOperations given as a string, shown quoted', () => {
    expect(() => new Budget('10' as unknown as number)).toThrow(
      'Invalid budget: maxOperations must be a whole number from 1 to 9007199254740991, got "10"',
    );
  });

  it('rejects a budget that is not a Budget', () => {
    expect(() => sketch(line, {}, fake)).toThrow('Invalid budget: must be a Budget made with new Budget(), or nothing');
  });
});
