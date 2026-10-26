import { FILL_STYLES, type Shape, type SketchStyle } from './types.js';

// Bounds that keep the stroke engine's work finite. Larger values have made it loop forever or
// run out of memory, which would take down a server rendering a chart from bad data.
const MAX_COORDINATE = 1e6;
const MAX_CURVE_STEPS = 1000;

const SIZE_FIELDS = new Set(['width', 'height', 'diameter']);
const MIN_POINTS = { polygon: 3, linearPath: 2, curve: 2 } as const;

const NUMERIC_STYLE_FIELDS = [
  'strokeWidth',
  'fillWeight',
  'hachureAngle',
  'hachureGap',
  'dashOffset',
  'dashGap',
  'zigzagOffset',
  'curveTightness',
  'curveFitting',
  'roughness',
  'bowing',
] as const;

/** Throws a descriptive error if the shape cannot be drawn safely. */
export function assertDrawable(shape: Shape, style: SketchStyle): void {
  for (const [field, value] of Object.entries(shape)) {
    if (typeof value === 'number') {
      assertCoordinate(`${shape.kind}.${field}`, value);
      if (SIZE_FIELDS.has(field) && value < 0) {
        throw new Error(`Invalid shape: ${shape.kind}.${field} must not be negative, got ${value}`);
      }
    }
  }
  if ('points' in shape) {
    if (shape.points.length < MIN_POINTS[shape.kind]) {
      throw new Error(
        `Invalid shape: ${shape.kind} needs at least ${MIN_POINTS[shape.kind]} points, got ${shape.points.length}`,
      );
    }
    for (const [x, y] of shape.points) {
      assertCoordinate(`${shape.kind}.points`, x);
      assertCoordinate(`${shape.kind}.points`, y);
    }
  }
  if (shape.kind === 'arc' && !(shape.stop > shape.start)) {
    throw new Error(`Invalid shape: arc.stop must be greater than arc.start`);
  }

  for (const field of NUMERIC_STYLE_FIELDS) {
    const value = style[field];
    if (value !== undefined && !Number.isFinite(value)) {
      throw new Error(`Invalid style: ${field} must be a finite number, got ${String(value)}`);
    }
  }
  const steps = style.curveStepCount;
  if (steps !== undefined && !(Number.isInteger(steps) && steps >= 1 && steps <= MAX_CURVE_STEPS)) {
    throw new Error(
      `Invalid style: curveStepCount must be an integer from 1 to ${MAX_CURVE_STEPS}, got ${String(steps)}`,
    );
  }
  if (style.fillStyle !== undefined && !(FILL_STYLES as readonly string[]).includes(style.fillStyle)) {
    throw new Error(`Unknown fill style: ${String(style.fillStyle)}`);
  }
}

function assertCoordinate(name: string, value: number): void {
  if (!(Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE)) {
    throw new Error(`Invalid shape: ${name} must be a finite number within ±${MAX_COORDINATE}, got ${value}`);
  }
}
