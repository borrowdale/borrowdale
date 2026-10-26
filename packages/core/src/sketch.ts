import { drawShape } from './engine.js';
import { stableKey, toSeed } from './seed.js';
import type { Shape, Sketch, SketchOptions } from './types.js';
import { assertDrawable } from './validate.js';

type DefinedOptions = { [K in keyof SketchOptions]?: Exclude<SketchOptions[K], undefined> };

export function sketch(shape: Shape, options: SketchOptions = {}): Sketch {
  // `{ stroke: undefined }` must mean "default", not override rough.js's default with undefined.
  const { seed, ...style } = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as DefinedOptions;
  assertDrawable(shape, style);
  return { paths: drawShape(shape, { ...style, seed: toSeed(seed ?? stableKey(shape)) }) };
}
