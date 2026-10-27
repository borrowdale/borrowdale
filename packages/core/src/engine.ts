// The boundary to the stroke engine (./engine/, a TypeScript port of rough.js 4.6.6).
// Replacing the engine means replacing this file and that directory.
import { DEFAULT_OPTIONS, type OpSet, type ResolvedOptions } from './engine/core.js';
import { opsToPath, shapeSets } from './engine/generator.js';
import type { Shape, SketchPath } from './types.js';

export type EngineOptions = Partial<Omit<ResolvedOptions, 'randomizer'>>;

/**
 * Coordinates are rounded to this many decimals. Different JavaScript engines (and V8 versions)
 * can disagree in the last bit of Math.sin/cos; rounding hides that in the coordinates. It does
 * not stop such a difference changing a dash or zigzag count (see the README). It also keeps the
 * markup small.
 */
const DECIMALS = 2;

export function drawShape(shape: Shape, options: EngineOptions): SketchPath[] {
  const o: ResolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  return shapeSets(shape, o).map((set) => toSketchPath(set, o));
}

function toSketchPath(set: OpSet, o: ResolvedOptions): SketchPath {
  const d = opsToPath(set, DECIMALS);
  switch (set.type) {
    case 'path':
      return { d, stroke: o.stroke, strokeWidth: o.strokeWidth, fill: 'none' };
    case 'fillPath':
      return { d, stroke: 'none', strokeWidth: 0, fill: o.fill || 'none' };
    case 'fillSketch':
      return {
        d,
        stroke: o.fill || 'none',
        strokeWidth: o.fillWeight < 0 ? o.strokeWidth / 2 : o.fillWeight,
        fill: 'none',
      };
  }
}
