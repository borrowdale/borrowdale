import { drawShape } from './engine.js';
import { stableKey, toSeed } from './seed.js';
import type { Shape, Sketch, SketchOptions } from './types.js';
import { assertDrawable } from './validate.js';

export function sketch(shape: Shape, options: SketchOptions = {}): Sketch {
  // `{ stroke: undefined }` must mean "default", not override the engine's default with undefined.
  const { seed, ...style } = assertDrawable(shape, options);
  return { paths: drawShape(shape, { ...style, seed: toSeed(seed ?? stableKey(shape)) }) };
}
