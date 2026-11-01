// The boundary to the stroke engine (./engine/, which began as a TypeScript port of rough.js 4.6.6).
// Replacing the engine means replacing this file and that directory.
import { Budget, drawWithin, MAX_OPERATIONS } from './budget.js';
import { DEFAULT_OPTIONS, fillWeight, type OpSet, type ResolvedOptions } from './engine/core.js';
import { opsToPath, shapeSets } from './engine/generator.js';
import type { Shape, ShapeKind, SketchPath } from './types.js';

export type EngineOptions = Partial<Omit<ResolvedOptions, 'randomizer'>>;

/** Coordinates are rounded to this many decimals, which keeps the markup small. */
const DECIMALS = 2;

// Kinds whose solid fill uses the even-odd rule, as rough.js's canvas renderer did. Its SVG renderer
// left out `path`; one rule now applies to every renderer.
const EVENODD_KINDS: ReadonlySet<ShapeKind> = new Set(['polygon', 'curve', 'path']);

export function drawShape(
  shape: Shape,
  { strokeLineDash, ...options }: EngineOptions & { strokeLineDash?: readonly number[] },
  budget: Budget = new Budget(MAX_OPERATIONS),
): SketchPath[] {
  const o: ResolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  o.hachureAngle = withinTurn(o.hachureAngle);
  return drawWithin(budget, () => shapeSets(shape, o).map((set) => toSketchPath(set, o, shape.kind, strokeLineDash)));
}

// An angle in degrees taken within one turn. The remainder of two doubles is exact, so a large angle
// draws as its remainder does, its radians stay far inside the trigonometry's range, and the 90° a
// cross-hatch adds to it is never lost to rounding. The remainder of -360 is -0, drawn as 0.
function withinTurn(degrees: number): number {
  const rest = degrees % 360;
  return rest === 0 ? 0 : rest;
}

function toSketchPath(
  set: OpSet,
  o: ResolvedOptions,
  kind: ShapeKind,
  strokeLineDash: readonly number[] | undefined,
): SketchPath {
  const d = opsToPath(set, DECIMALS);
  switch (set.type) {
    // A dash applies to the outline only: on a hachure fill it would break every line.
    case 'path':
      return {
        d,
        stroke: o.stroke,
        strokeWidth: o.strokeWidth,
        // Copied by index, as validation read it.
        ...(strokeLineDash
          ? { strokeLineDash: Array.from({ length: strokeLineDash.length }, (_, i) => strokeLineDash[i]!) }
          : {}),
        fill: 'none',
      };
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
