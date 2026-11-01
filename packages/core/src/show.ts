// The longest string an error message repeats; a longer one is described by its length.
const MAX_SHOWN = 100;
// The longest array an error message writes out; a longer one is described by its length.
const MAX_ENTRIES = 8;
// Characters that could break or disguise a line of a log: controls, line separators, and
// bidirectional marks and overrides.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

/**
 * A rejected value, for an error message, written the same way by every @borrowdale package.
 * Strings are quoted so `"10"` is visibly not the number 10, with characters that could disguise a
 * line written as escapes; a long string is described by its length. An array of up to 8 entries is
 * written in brackets, `[4, -1]`, its entries shown the same way but arrays and objects among them
 * only by kind; a longer array, a typed array and any other object is described by its kind, never
 * converted, since that could throw or run code from the input. A bigint keeps its `n`, and -0 its
 * sign.
 */
export function show(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > MAX_SHOWN ? `a string of ${value.length} characters` : escaped(JSON.stringify(value));
  }
  if (Array.isArray(value)) {
    return value.length <= MAX_ENTRIES ? bracketed(value) : `an array of ${value.length}`;
  }
  if (ArrayBuffer.isView(value)) {
    return `a ${Object.prototype.toString.call(value).slice(8, -1)}`;
  }
  if (typeof value === 'object' && value !== null) {
    return 'an object';
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return `a ${typeof value}`;
  }
  return Object.is(value, -0) ? '-0' : String(value);
}

// By index, so a hole shows as undefined; an entry whose getter throws leaves only the length.
function bracketed(array: readonly unknown[]): string {
  try {
    const entries = Array.from({ length: array.length }, (_, i) => {
      const entry = array[i];
      return Array.isArray(entry) ? `an array of ${entry.length}` : show(entry);
    });
    return `[${entries.join(', ')}]`;
  } catch {
    return `an array of ${array.length}`;
  }
}

/** `message` with every character that could break or disguise a line of a log written as its \u escape. */
export function escaped(message: string): string {
  return message.replace(UNSAFE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
