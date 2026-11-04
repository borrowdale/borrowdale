import { drawShape } from './engine.js';
import { isBudget, type Budget } from './budget.js';
import { stableKey, toSeed } from './seed.js';
import type { Shape, Sketch, SketchOptions } from './types.js';
import { assertDrawable } from './validate.js';

/**
 * Draws a shape with hand-drawn strokes. Each call may do 200,000 units of work, unless it is given
 * a `budget`, whose limit then applies instead. Pass the same budget to several calls to bound
 * their work together. Throws for a budget not made with `new Budget()`.
 */
export function sketch(shape: Shape, options: SketchOptions = {}, budget?: Budget): Sketch {
  if (budget !== undefined && !isBudget(budget)) {
    throw new Error('Invalid budget: must be a Budget made with new Budget(), or nothing');
  }
  // `{ stroke: undefined }` must mean "default", not override the engine's default with undefined.
  const { seed, ...style } = assertDrawable(shape, options);
  return { paths: drawShape(shape, { ...style, seed: toSeed(seed ?? stableKey(shape)) }, budget) };
}
