// Bounds the work of one drawing, so a shape that would hang or exhaust memory fails fast instead.
// Not part of rough.js. Every stroke charges, and so does every loop whose iteration count is NOT
// bounded by the size of its own input: angle and scan-line loops stepping by an option-derived
// increment, curve subdivision, simplification, and path tokenizing. A loop over an input it was
// handed (a point list, a set of lines) does not charge again. The unit is a rough "work unit", not
// an exact operation count; the public error keeps the word "operations".

export const MAX_OPERATIONS = 200_000;

let spent = 0;

/** Starts a new drawing's budget. drawShape() calls it once per sketch() call. */
export function resetBudget(): void {
  spent = 0;
}

/** Records `count` units of work, throwing once the drawing has done more than MAX_OPERATIONS. */
export function charge(count = 1): void {
  spent += count;
  if (spent > MAX_OPERATIONS) {
    throw new Error(`Drawing too complex (more than ${MAX_OPERATIONS} operations)`);
  }
}
