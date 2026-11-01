// Bounds the work of one drawing, so a shape that would hang or exhaust memory fails fast instead.
// Not part of rough.js. Charged: every stroke; every loop whose iteration count is not bounded by
// the size of its input (angle and scan-line loops stepping by an option-derived increment, curve
// subdivision, path tokenizing); and the per-point loops that build output paths (solid fills,
// curves, simplification). Loops that only transform points already counted (rotating, sorting
// edges, converting curves) are not charged. The unit is a rough "work unit", not an exact
// operation count; the public error keeps the word "operations".
import { show } from './show.js';

export const MAX_OPERATIONS = 200_000;

// Set by Budget's static block, which alone can reach its private fields: only the engine can charge
// a budget, nothing can refund one or raise its limit, and only a budget made by the constructor
// passes `isBudget`.
let chargeTo: (budget: Budget, count: number) => void;
export let isBudget: (value: unknown) => value is Budget;

/**
 * A limit on drawing work. Each `sketch()` call gets a budget of 200,000 units of its own unless
 * one is passed in. Calls given the same budget share its limit: the call that takes their total
 * past `maxOperations` throws, and so does every later call given it.
 */
export class Budget {
  #max: number;
  #spent = 0;

  static {
    chargeTo = (budget, count) => {
      budget.#spent += count;
      if (budget.#spent > budget.#max) {
        throw new Error(`Drawing too complex (more than ${budget.#max} operations)`);
      }
    };
    isBudget = (value): value is Budget => typeof value === 'object' && value !== null && #spent in value;
  }

  /** `maxOperations`: a whole number from 1 to `Number.MAX_SAFE_INTEGER`. */
  constructor(maxOperations: number) {
    if (!(Number.isSafeInteger(maxOperations) && maxOperations > 0)) {
      throw new Error(
        `Invalid budget: maxOperations must be a whole number from 1 to ${Number.MAX_SAFE_INTEGER}, got ${show(maxOperations)}`,
      );
    }
    this.#max = maxOperations;
  }

  /** The most work units the drawings given this budget may charge in all. */
  get maxOperations(): number {
    return this.#max;
  }

  /** Work units charged so far. */
  get spent(): number {
    return this.#spent;
  }
}

let active: Budget | undefined;

/**
 * Runs `draw` with every charge going to `budget`, then restores the drawing that was running
 * before, so a drawing started inside another (by a getter on a shape, say) cannot bill its work
 * to the wrong budget.
 */
export function drawWithin<T>(budget: Budget, draw: () => T): T {
  const outer = active;
  active = budget;
  try {
    return draw();
  } finally {
    active = outer;
  }
}

/** Records `count` units of work against the drawing that is running. */
export function charge(count = 1): void {
  if (!active) {
    throw new Error('The engine charged work outside a drawing');
  }
  chargeTo(active, count);
}
