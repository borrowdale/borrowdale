import { beforeEach, describe, expect, it } from 'vitest';
import { charge, MAX_OPERATIONS, resetBudget } from '../src/engine/budget.js';

// The error promises "more than" the limit, so exactly the limit must still be allowed.
describe('work budget', () => {
  beforeEach(() => {
    resetBudget();
  });

  it('allows exactly the limit', () => {
    expect(() => charge(MAX_OPERATIONS)).not.toThrow();
  });

  it('throws on the first unit past the limit', () => {
    charge(MAX_OPERATIONS);

    expect(() => charge(1)).toThrow(`Drawing too complex (more than ${MAX_OPERATIONS} operations)`);
  });
});
