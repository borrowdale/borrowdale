// Bounds the work of one drawing. Every loop whose length depends on the input charges here, so a
// shape that would hang or exhaust memory fails fast instead. Not part of rough.js.

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
