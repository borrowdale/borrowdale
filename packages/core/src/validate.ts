import { FILL_STYLES, type Shape, type ShapeKind, type SketchOptions } from './types.js';

// Bounds on what callers may pass. The engine additionally bounds its total work per drawing.
export const MAX_COORDINATE = 1e6;
const MAX_CURVE_STEPS = 1000;
const MAX_ROUGHNESS = 10;

type FieldRule = 'coordinate' | 'size';

// Every numeric field each kind requires. `satisfies` makes a new kind fail to compile until its
// fields are listed here.
const SHAPE_FIELDS = {
  line: { x1: 'coordinate', y1: 'coordinate', x2: 'coordinate', y2: 'coordinate' },
  rectangle: { x: 'coordinate', y: 'coordinate', width: 'size', height: 'size' },
  ellipse: { cx: 'coordinate', cy: 'coordinate', width: 'size', height: 'size' },
  circle: { cx: 'coordinate', cy: 'coordinate', diameter: 'size' },
  arc: { cx: 'coordinate', cy: 'coordinate', width: 'size', height: 'size', start: 'coordinate', stop: 'coordinate' },
  polygon: {},
  linearPath: {},
  curve: {},
  path: {},
} as const satisfies Record<ShapeKind, Record<string, FieldRule>>;

const MIN_POINTS = { polygon: 3, linearPath: 2, curve: 2 } as const;

type OptionRule = 'string' | 'number' | 'angle' | 'unit' | 'roughness' | 'steps' | 'fillStyle' | 'seed';

// The complete list of accepted options: anything else is a typo or an engine internal.
const OPTION_RULES: Record<keyof SketchOptions, OptionRule> = {
  stroke: 'string',
  strokeWidth: 'number',
  fill: 'string',
  fillStyle: 'fillStyle',
  fillWeight: 'number',
  hachureAngle: 'angle',
  hachureGap: 'number',
  dashOffset: 'number',
  dashGap: 'number',
  zigzagOffset: 'number',
  curveTightness: 'unit',
  curveFitting: 'unit',
  curveStepCount: 'steps',
  roughness: 'roughness',
  bowing: 'roughness',
  seed: 'seed',
};

/** Throws a descriptive error if the shape or options cannot be drawn. */
export function assertDrawable(shape: Shape, options: SketchOptions): void {
  assertShape(shape);
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      assertOption(key, value);
    }
  }
}

function assertShape(shape: Shape): void {
  const kind: unknown = (shape as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !Object.hasOwn(SHAPE_FIELDS, kind)) {
    throw new Error(`Unknown shape kind: ${String(kind)}`);
  }
  const fields: Record<string, FieldRule> = SHAPE_FIELDS[shape.kind];
  for (const [field, rule] of Object.entries(fields)) {
    const value: unknown = (shape as unknown as Record<string, unknown>)[field];
    assertNumber(`${shape.kind}.${field}`, value);
    if (rule === 'size' && (value as number) < 0) {
      throw new Error(`Invalid shape: ${shape.kind}.${field} must not be negative, got ${show(value)}`);
    }
  }
  switch (shape.kind) {
    case 'arc':
      if (!(shape.stop > shape.start)) {
        throw new Error('Invalid shape: arc.stop must be greater than arc.start');
      }
      if (shape.closed !== undefined && typeof shape.closed !== 'boolean') {
        throw new Error(`Invalid shape: arc.closed must be a boolean, got ${show(shape.closed)}`);
      }
      break;
    case 'polygon':
    case 'linearPath':
    case 'curve':
      assertPoints(shape.kind, shape.points);
      break;
    case 'path':
      if (typeof shape.d !== 'string') {
        throw new Error(`Invalid shape: path.d must be a string, got ${show(shape.d)}`);
      }
      break;
  }
}

function assertPoints(kind: keyof typeof MIN_POINTS, points: unknown): void {
  if (!Array.isArray(points)) {
    throw new Error(`Invalid shape: ${kind}.points must be an array of [x, y] pairs, got ${show(points)}`);
  }
  if (points.length < MIN_POINTS[kind]) {
    throw new Error(`Invalid shape: ${kind} needs at least ${MIN_POINTS[kind]} points, got ${points.length}`);
  }
  for (const [index, point] of points.entries()) {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error(`Invalid shape: ${kind}.points[${index}] must be an [x, y] pair, got ${show(point)}`);
    }
    assertNumber(`${kind}.points[${index}]`, point[0]);
    assertNumber(`${kind}.points[${index}]`, point[1]);
  }
}

function assertOption(key: string, value: unknown): void {
  if (!Object.hasOwn(OPTION_RULES, key)) {
    throw new Error(`Unknown option: ${key}`);
  }
  switch (OPTION_RULES[key as keyof SketchOptions]) {
    case 'string':
      if (typeof value !== 'string') {
        throw new Error(`Invalid style: ${key} must be a string, got ${show(value)}`);
      }
      break;
    case 'number':
      if (!(typeof value === 'number' && Number.isFinite(value))) {
        throw new Error(`Invalid style: ${key} must be a finite number, got ${show(value)}`);
      }
      break;
    case 'angle':
      // Degrees. The engine's own trigonometry reduces arguments only up to about 1.6e6 radians.
      if (!(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE)) {
        throw new Error(`Invalid style: ${key} must be a finite number within ±${MAX_COORDINATE}, got ${show(value)}`);
      }
      break;
    case 'unit':
      // Both scale coordinates: far outside 0–1 they put Infinity into the path data.
      if (!(typeof value === 'number' && value >= 0 && value <= 1)) {
        throw new Error(`Invalid style: ${key} must be a number from 0 to 1, got ${show(value)}`);
      }
      break;
    case 'roughness':
      if (!(typeof value === 'number' && value >= 0 && value <= MAX_ROUGHNESS)) {
        throw new Error(`Invalid style: ${key} must be a number from 0 to ${MAX_ROUGHNESS}, got ${show(value)}`);
      }
      break;
    case 'steps':
      if (!(Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_CURVE_STEPS)) {
        throw new Error(`Invalid style: ${key} must be an integer from 1 to ${MAX_CURVE_STEPS}, got ${show(value)}`);
      }
      break;
    case 'fillStyle':
      if (!(FILL_STYLES as readonly unknown[]).includes(value)) {
        throw new Error(`Unknown fill style: ${String(value)}`);
      }
      break;
    case 'seed':
      if (!(typeof value === 'string' || typeof value === 'number')) {
        throw new Error(`Invalid style: seed must be a string or a number, got ${show(value)}`);
      }
      break;
  }
}

function assertNumber(name: string, value: unknown): void {
  if (!(typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE)) {
    throw new Error(`Invalid shape: ${name} must be a finite number within ±${MAX_COORDINATE}, got ${show(value)}`);
  }
}

/** Throws if a parsed path contains a number outside ±MAX_COORDINATE. */
export function assertPathData(segments: readonly { data: readonly number[] }[]): void {
  for (const { data } of segments) {
    for (const value of data) {
      if (!(Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE)) {
        throw new Error(`Invalid shape: path.d contains ${value}, outside ±${MAX_COORDINATE}`);
      }
    }
  }
}

// Strings are quoted so `"10"` is visibly not the number 10.
function show(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}
