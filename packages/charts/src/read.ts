// Reading a chart spec that came from JSON: through own properties only, arrays by index, and every
// problem reported as one named error that says where in the spec it is.
import { measureText } from '@borrowdale/text';

// The longest text @borrowdale/text lays out.
const MAX_TEXT = 1000;
// The longest string an error message repeats; a longer one is described by its length.
const MAX_SHOWN = 100;
// The longest message from another package's check that an error repeats.
const MAX_MESSAGE = 200;
// Characters that could break or disguise a line of a log: controls, line separators, and
// bidirectional marks and overrides.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
/** Large enough for any count or amount, and small enough that `toFixed` never uses exponent notation. */
export const MAX_VALUE = 1e15;
/** The most decimals a number is written with. */
export const MAX_DECIMALS = 20;

/** Reads a value at `path`, returning it checked, or throws. */
export type Check<T> = (path: string, value: unknown) => T;

/**
 * What every spec problem throws. Its message is "Invalid chart: <path> <problem>"; `path` is the
 * place in the spec, such as `series[2].data[5]`, or `''` for the spec itself.
 */
export class InvalidChartError extends Error {
  override readonly name = 'InvalidChartError';
  readonly path: string;
  readonly problem: string;

  constructor(path: string, problem: string) {
    super(`Invalid chart: ${path === '' ? '' : `${path} `}${problem}`);
    this.path = path;
    this.problem = problem;
  }
}

/** Throws an `InvalidChartError` for the spec at `path`. */
export function fail(path: string, problem: string): never {
  throw new InvalidChartError(path, problem);
}

/**
 * A rejected value, for an error message. Strings are quoted so `"10"` is visibly not the number 10;
 * a long string is described by its length, and anything but a string, number, boolean or null by
 * its kind, since converting it to a string could throw or run code from the spec.
 */
export function show(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > MAX_SHOWN ? `a string of ${value.length} characters` : escaped(JSON.stringify(value));
  }
  if (Array.isArray(value)) {
    return `an array of ${value.length}`;
  }
  if (typeof value === 'object' && value !== null) {
    return 'an object';
  }
  return typeof value === 'function' || typeof value === 'symbol' ? `a ${typeof value}` : String(value);
}

// Each unsafe character written as its \u escape.
function escaped(message: string): string {
  return message.replace(UNSAFE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** The fields of one spec object. A field set to `undefined` counts as not set, as in core. */
export interface Fields {
  /** Rejects any own key not in `keys`, unless it is set to `undefined`. */
  allow(keys: readonly string[]): void;
  has(key: string): boolean;
  required<T>(key: string, check: Check<T>): T;
  optional<T>(key: string, check: Check<T>): T | undefined;
}

/** The object at `path`, the spec itself at `''`. */
export function fields(path: string, value: unknown): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, `${path === '' ? 'expected' : 'must be'} an object, got ${show(value)}`);
  }
  const raw = value as Record<string, unknown>;
  // Own properties only: a key the spec inherits, like `constructor`, is not set.
  const read = (key: string): unknown => (Object.hasOwn(raw, key) ? raw[key] : undefined);
  return {
    allow: (keys) => {
      const unknown = Object.keys(raw).find((key) => !keys.includes(key) && raw[key] !== undefined);
      if (unknown !== undefined) {
        fail(path, `${path === '' ? 'unknown key' : 'has an unknown key,'} ${show(unknown)}`);
      }
    },
    has: (key) => read(key) !== undefined,
    required: (key, check) => {
      const field = read(key);
      return field === undefined ? fail(join(path, key), 'is missing') : check(join(path, key), field);
    },
    optional: (key, check) => {
      const field = read(key);
      return field === undefined ? undefined : check(join(path, key), field);
    },
  };
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

/**
 * An array of `min` to `max` entries, read by index, so a hole is undefined and is rejected. Each
 * entry's check also gets its index.
 */
export function list<T>(
  min: number,
  max: number,
  entry: (path: string, value: unknown, index: number) => T,
): Check<T[]> {
  return (path, value) => {
    if (!Array.isArray(value)) {
      fail(path, `must be an array, got ${show(value)}`);
    }
    if (value.length < min || value.length > max) {
      fail(path, `must have ${min === max ? min : `${min} to ${max}`} entries, got ${value.length}`);
    }
    return Array.from({ length: value.length }, (_, i) => entry(`${path}[${i}]`, value[i] as unknown, i));
  };
}

export function number(min: number, max: number, alternative = ''): Check<number> {
  return (path, value) => {
    if (typeof value !== 'number' || !(value >= min && value <= max)) {
      const bounds = `from ${bound(min)} to ${bound(max)}${alternative === '' ? '' : ` ${alternative}`}`;
      fail(path, `must be a number ${bounds}, got ${show(value)}`);
    }
    return value;
  };
}

// ±MAX_VALUE written the way a reader writes it.
function bound(value: number): string {
  return Math.abs(value) === MAX_VALUE ? `${value < 0 ? '-' : ''}1e15` : String(value);
}

export function integer(min: number, max: number): Check<number> {
  return (path, value) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || !(value >= min && value <= max)) {
      fail(path, `must be an integer from ${min} to ${max}, got ${show(value)}`);
    }
    return value;
  };
}

/** A value `check` accepts, or `null` for a missing one. */
export function nullable<T>(check: Check<T>): Check<T | null> {
  return (path, value) => (value === null ? null : check(path, value));
}

/**
 * A string of at most `max` characters that @borrowdale/text can draw, so a line break or a
 * character SVG cannot hold is rejected here even where the string only reaches a tooltip.
 */
export function text(max = MAX_TEXT): Check<string> {
  return (path, value) => {
    if (typeof value !== 'string' || value.length > max) {
      fail(path, `must be a string of at most ${max} characters, got ${show(value)}`);
    }
    probe(path, () => measureText(value));
    return value;
  };
}

export const boolean: Check<boolean> = (path, value) => {
  if (typeof value !== 'boolean') {
    fail(path, `must be true or false, got ${show(value)}`);
  }
  return value;
};

export function oneOf<const T extends string>(options: readonly T[]): Check<T> {
  return (path, value) => {
    if (!options.includes(value as T)) {
      fail(path, `must be one of ${options.join(', ')}, got ${show(value)}`);
    }
    return value as T;
  };
}

/** A tuple of numbers within ±MAX_VALUE, named for the error message: `tuple(['x', 'y'])`. */
export function tuple<const N extends readonly string[]>(names: N): Check<{ [K in keyof N]: number }> {
  const entry = number(-MAX_VALUE, MAX_VALUE);
  return (path, value) => {
    if (!Array.isArray(value) || value.length !== names.length) {
      fail(path, `must be a [${names.join(', ')}] array, got ${show(value)}`);
    }
    return names.map((_, i) => entry(`${path}[${i}]`, value[i] as unknown)) as { [K in keyof N]: number };
  };
}

/**
 * Runs another package's own check, reporting its error at `path`. The other package repeats what it
 * rejects as it is, so its message is escaped and cut short here.
 */
export function probe(path: string, check: () => unknown): void {
  try {
    check();
  } catch (error) {
    const message = escaped(error instanceof Error ? error.message : show(error));
    // Cut so as not to leave half of a surrogate pair at the end.
    const short = `${message.slice(0, MAX_MESSAGE).replace(/[\ud800-\udbff]$/, '')}…`;
    fail(path, `is not valid: ${message.length > MAX_MESSAGE ? short : message}`);
  }
}

/** Throws at the first name that repeats one before it. */
export function unique(names: readonly string[], pathOf: (index: number) => string): void {
  const seen = new Set<string>();
  names.forEach((name, i) => {
    if (seen.has(name)) {
      fail(pathOf(i), `repeats ${show(name)}`);
    }
    seen.add(name);
  });
}
