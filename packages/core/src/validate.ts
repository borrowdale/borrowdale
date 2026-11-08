import { MAX_COORDINATE } from './engine/core.js';
import { MAX_ANGLE } from './trig.js';
import { isPaint, PAINT_RULE } from './paint.js';
import { show } from './show.js';
import { FILL_STYLES, type Shape, type ShapeKind, type SketchOptions } from './types.js';

// Bounds on what callers may pass. The engine additionally bounds its total work per drawing.
const MAX_CURVE_STEPS = 1000;
const MAX_DASHES = 16;
const MAX_ARRAY_LENGTH = 2 ** 32 - 1;
// The shortest dash pattern, dash and gap lengths added up.
const MIN_DASH_PATTERN = 1;
const MAX_ROUGHNESS = 10;

// A number or a size must be finite and within ±MAX_COORDINATE, and a size not negative; an angle, in
// radians, must be finite and within ±MAX_ANGLE.
type FieldRule = 'number' | 'size' | 'angle';

// Every numeric field each kind requires. `satisfies` makes a new kind fail to compile until its
// fields are listed here.
const SHAPE_FIELDS = {
  line: { x1: 'number', y1: 'number', x2: 'number', y2: 'number' },
  rectangle: { x: 'number', y: 'number', width: 'size', height: 'size' },
  ellipse: { cx: 'number', cy: 'number', width: 'size', height: 'size' },
  circle: { cx: 'number', cy: 'number', diameter: 'size' },
  arc: { cx: 'number', cy: 'number', width: 'size', height: 'size', start: 'angle', stop: 'angle' },
  polygon: {},
  linearPath: {},
  curve: {},
  path: {},
} as const satisfies Record<ShapeKind, Record<string, FieldRule>>;

const MIN_POINTS = { polygon: 3, linearPath: 2, curve: 2 } as const;

interface OptionRule {
  ok: (value: unknown) => boolean;
  /** Completes "must be …" in the error message. */
  expected: string;
  /** Replaces the whole message, for errors worded differently. */
  message?: (value: unknown) => string;
}

function isWithin(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
}

function range(min: number, max: number, integer = false): OptionRule {
  return {
    ok: (value) => typeof value === 'number' && (!integer || Number.isInteger(value)) && value >= min && value <= max,
    expected: `${integer ? 'an integer' : 'a number'} from ${min} to ${max}`,
  };
}

// Read by index, so a hole in the array is rejected rather than skipped.
function isDashArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DASHES) {
    return false;
  }
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    const length: unknown = value[i];
    if (!isWithin(length, MAX_COORDINATE) || length < 0) {
      return false;
    }
    total += length;
  }
  // All zeros draw nothing in a canvas and a solid line in SVG, and a pattern much shorter than a unit
  // has a browser paint millions of dashes, work that no budget sees.
  return total >= MIN_DASH_PATTERN;
}

// A colour, or a pattern or gradient in the same document such as `pattern().fill`. Not any CSS
// paint: a `url(…)` to another file or a `var(…)` would have an SVG fetch it or use the page's values.
const PAINT: OptionRule = {
  ok: isPaint,
  expected: PAINT_RULE,
};

const FINITE: OptionRule = { ok: Number.isFinite, expected: 'a finite number' };
const UNIT = range(0, 1);
const ROUGHNESS = range(0, MAX_ROUGHNESS);

// The complete list of accepted options: anything else is a typo or an engine internal.
const OPTION_RULES: Record<keyof SketchOptions, OptionRule> = {
  stroke: PAINT,
  strokeWidth: FINITE,
  strokeLineDash: {
    ok: isDashArray,
    expected:
      `an array of 1 to ${MAX_DASHES} lengths from 0 to ${MAX_COORDINATE}, ` +
      `adding up to at least ${MIN_DASH_PATTERN}`,
  },
  fill: PAINT,
  fillStyle: {
    ok: (value) => (FILL_STYLES as readonly unknown[]).includes(value),
    expected: 'a fill style',
    message: (value) => `Unknown fill style: ${show(value)}`,
  },
  fillWeight: FINITE,
  // In degrees, any number of turns: the engine takes it within one (engine.ts).
  hachureAngle: FINITE,
  hachureGap: FINITE,
  dashOffset: FINITE,
  dashGap: FINITE,
  zigzagOffset: FINITE,
  // Both scale coordinates: far outside 0–1 they put Infinity into the path data.
  curveTightness: UNIT,
  curveFitting: UNIT,
  curveStepCount: range(1, MAX_CURVE_STEPS, true),
  roughness: ROUGHNESS,
  bowing: ROUGHNESS,
  seed: { ok: (value) => typeof value === 'string' || typeof value === 'number', expected: 'a string or a number' },
};

export type DefinedOptions = { [K in keyof SketchOptions]?: Exclude<SketchOptions[K], undefined> };

/**
 * Throws a descriptive error if the shape or options cannot be drawn. Returns the options without
 * the ones set to `undefined`, which count as not set.
 */
export function assertDrawable(shape: Shape, options: SketchOptions): DefinedOptions {
  if (typeof shape !== 'object' || shape === null) {
    throw new Error(`Invalid shape: expected an object, got ${show(shape)}`);
  }
  if (typeof options !== 'object' || options === null) {
    throw new Error(`Invalid style: options must be an object, got ${show(options)}`);
  }
  assertShape(shape);
  const defined = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]): [string, unknown] => [key, key === 'strokeLineDash' ? ownDash(value) : value]);
  for (const [key, value] of defined) {
    assertOption(key, value);
  }
  return Object.fromEntries(defined);
}

/**
 * A copy of a dash list, read by index once, so the lengths that are checked are the lengths that are
 * drawn. A list claiming more lengths than are allowed becomes an empty list of the same length, which
 * fails the check without its entries being read.
 */
export function ownDash(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  const length = value.length;
  if (length <= MAX_DASHES) {
    return Array.from({ length }, (_, i): unknown => value[i]);
  }
  // Only a proxy can claim a length no array has; it fails the check as one entry too many.
  return new Array<unknown>(Number.isSafeInteger(length) && length <= MAX_ARRAY_LENGTH ? length : MAX_DASHES + 1);
}

function assertShape(shape: Shape): void {
  // The shape comes from callers' data, so its type is a claim until checked here.
  const raw = shape as unknown as Record<string, unknown>;
  if (typeof raw.kind !== 'string' || !Object.hasOwn(SHAPE_FIELDS, raw.kind)) {
    throw new Error(`Unknown shape kind: ${show(raw.kind)}`);
  }
  const fields: Record<string, FieldRule> = SHAPE_FIELDS[shape.kind];
  for (const [field, rule] of Object.entries(fields)) {
    const value = raw[field];
    assertNumber(`${shape.kind}.${field}`, value, rule === 'angle' ? MAX_ANGLE : MAX_COORDINATE);
    if (rule === 'size' && value < 0) {
      throw new Error(`Invalid shape: ${shape.kind}.${field} must not be negative, got ${show(value)}`);
    }
  }
  switch (shape.kind) {
    case 'arc':
      if (!(shape.stop > shape.start)) {
        throw new Error(`Invalid shape: arc.stop must be greater than arc.start, got start ${show(shape.start)}, stop ${show(shape.stop)}`);
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
    throw new Error(`Unknown option: ${show(key)}`);
  }
  const rule = OPTION_RULES[key as keyof SketchOptions];
  if (!rule.ok(value)) {
    throw new Error(rule.message?.(value) ?? `Invalid style: ${key} must be ${rule.expected}, got ${show(value)}`);
  }
}

function assertNumber(name: string, value: unknown, bound = MAX_COORDINATE): asserts value is number {
  if (!isWithin(value, bound)) {
    throw new Error(`Invalid shape: ${name} must be a finite number within ±${bound}, got ${show(value)}`);
  }
}
