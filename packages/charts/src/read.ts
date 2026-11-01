// Reading a chart spec that came from JSON: through own properties only, arrays by index, and every
// problem reported as one named error that says where in the spec it is.
import { escaped, show } from '@borrowdale/core/show';
import { measureText } from '@borrowdale/text';

// The longest text @borrowdale/text lays out.
const MAX_TEXT = 1000;
// The longest message from another package's check that an error repeats.
const MAX_MESSAGE = 200;
/** Large enough for any count or amount, and small enough that `toFixed` never uses exponent notation. */
export const MAX_VALUE = 1e15;
/** The most decimals a number is written with. */
export const MAX_DECIMALS = 20;
/** The most ticks an axis may have, whether listed in `ticks` or made by its `step`. */
export const MAX_TICKS = 1_000;
// The longest string read where a time may be given: "2026-11-01T09:30:15.250+01:00" is 29.
const MAX_TIME_TEXT = 40;

export { show };

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
 * entry's check also gets its index. `reserve` receives the validated length before allocation.
 */
export function list<T>(
  min: number,
  max: number,
  entry: (path: string, value: unknown, index: number) => T,
  reserve?: (count: number) => void,
): Check<T[]> {
  return (path, value) => {
    if (!Array.isArray(value)) {
      fail(path, `must be an array, got ${show(value)}`);
    }
    const length = value.length;
    if (!Number.isInteger(length) || length < min || length > max) {
      fail(path, `must have ${min === max ? min : `${min} to ${max}`} entries, got ${show(length)}`);
    }
    reserve?.(length);
    return Array.from({ length }, (_, i) => entry(`${path}[${i}]`, value[i] as unknown, i));
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
 * Like `tuple`, but an entry may also be a string: a time, for a value on a time axis. The strings
 * are carried as they are until the axes are known, when each is read as a time or rejected
 * (`resolveValues` in validate.ts); the type says number because nothing reads them before then.
 */
export function coordinates<const N extends readonly string[]>(names: N): Check<{ [K in keyof N]: number }> {
  return (path, value) => {
    if (!Array.isArray(value) || value.length !== names.length) {
      fail(path, `must be a [${names.join(', ')}] array, got ${show(value)}`);
    }
    return names.map((_, i) => coordinate(`${path}[${i}]`, value[i] as unknown)) as { [K in keyof N]: number };
  };
}

/** One entry of `coordinates`: a number, or a string carried until it is read as a time. */
export const coordinate: Check<number> = (path, value) =>
  typeof value === 'string' ? (text(MAX_TIME_TEXT)(path, value) as unknown as number) : number(-MAX_VALUE, MAX_VALUE)(path, value);

/**
 * Runs another package's own check, reporting its error at `path`. The other package writes what it
 * rejects with `show`, but a list it rejects can make its message long, so the message is cut short
 * here, and escaped in case something else threw it.
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
