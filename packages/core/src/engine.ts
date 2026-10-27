// The boundary to the stroke engine (./engine/, a TypeScript port of rough.js 4.6.6).
// Replacing the engine means replacing this file and that directory.
import { resetBudget } from './engine/budget.js';
import { DEFAULT_OPTIONS, fillWeight, type OpSet, type ResolvedOptions } from './engine/core.js';
import { opsToPath, shapeSets } from './engine/generator.js';
import type { Shape, ShapeKind, SketchPath } from './types.js';

export type EngineOptions = Partial<Omit<ResolvedOptions, 'randomizer'>>;

/** Coordinates are rounded to this many decimals, which keeps the markup small. */
const DECIMALS = 2;

// Kinds whose solid fill uses the even-odd rule, as rough.js's canvas renderer did. Its SVG renderer
// left out `path`; one rule now applies to every renderer.
const EVENODD_KINDS: ReadonlySet<ShapeKind> = new Set(['polygon', 'curve', 'path']);

export function drawShape(shape: Shape, options: EngineOptions): SketchPath[] {
  resetBudget();
  const o: ResolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  return shapeSets(shape, o).map((set) => toSketchPath(set, o, shape.kind));
}

function toSketchPath(set: OpSet, o: ResolvedOptions, kind: ShapeKind): SketchPath {
  const d = opsToPath(set, DECIMALS);
  switch (set.type) {
    case 'path':
      return { d, stroke: o.stroke, strokeWidth: o.strokeWidth, fill: 'none' };
    case 'fillPath':
      return {
        d,
        stroke: 'none',
        strokeWidth: 0,
        fill: o.fill || 'none',
        ...(EVENODD_KINDS.has(kind) ? { fillRule: 'evenodd' as const } : {}),
      };
    case 'fillSketch':
      return {
        d,
        stroke: o.fill || 'none',
        strokeWidth: fillWeight(o),
        fill: 'none',
      };
  }
}
