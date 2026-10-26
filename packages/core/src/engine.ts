// The only module that touches rough.js. Replacing the stroke engine means replacing this file.
import rough from 'roughjs';
import type { Drawable, OpSet, Options, ResolvedOptions } from 'roughjs/bin/core';
import type { Point as RoughPoint } from 'roughjs/bin/geometry';
import type { Point, Shape, SketchPath } from './types.js';

const generator = rough.generator();

/**
 * Coordinates are rounded to this many decimals. Different JavaScript engines (and V8 versions)
 * can disagree in the last bit of Math.sin/cos; rounding hides that in the coordinates. It does
 * not stop such a difference changing a dash or zigzag count (see the README). It also keeps the
 * markup small.
 */
const DECIMALS = 2;

export function drawShape(shape: Shape, options: Options): SketchPath[] {
  const drawable = drawableFor(shape, options);
  const o = drawable.options;
  return drawable.sets.map((set) => toSketchPath(set, o));
}

// Mirrors rough.js RoughGenerator.toPaths, but with rounded coordinates.
function toSketchPath(set: OpSet, o: ResolvedOptions): SketchPath {
  const d = generator.opsToPath(set, DECIMALS);
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

function drawableFor(shape: Shape, options: Options): Drawable {
  switch (shape.kind) {
    case 'line':
      return generator.line(shape.x1, shape.y1, shape.x2, shape.y2, options);
    case 'rectangle':
      return generator.rectangle(shape.x, shape.y, shape.width, shape.height, options);
    case 'ellipse':
      return generator.ellipse(shape.cx, shape.cy, shape.width, shape.height, options);
    case 'circle':
      return generator.circle(shape.cx, shape.cy, shape.diameter, options);
    case 'arc':
      return generator.arc(
        shape.cx,
        shape.cy,
        shape.width,
        shape.height,
        shape.start,
        shape.stop,
        shape.closed ?? false,
        options,
      );
    case 'polygon':
      return generator.polygon(toRoughPoints(shape.points), options);
    case 'linearPath':
      return generator.linearPath(toRoughPoints(shape.points), options);
    case 'curve':
      return generator.curve(toRoughPoints(shape.points), options);
    case 'path':
      return generator.path(shape.d, options);
    default:
      return unknownKind(shape);
  }
}

function unknownKind(shape: never): never {
  throw new Error(`Unknown shape kind: ${String((shape as { kind?: unknown }).kind)}`);
}

function toRoughPoints(points: readonly Point[]): RoughPoint[] {
  return points.map(([x, y]) => [x, y]);
}
