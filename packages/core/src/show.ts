// The longest string an error message repeats; a longer one is described by its length.
const MAX_SHOWN = 100;
// The longest array an error message writes out; a longer one is described by its length.
const MAX_ENTRIES = 8;
// The largest bigint either side of zero an error message writes out; a larger one is described by
// that bound, which it is checked against without being written.
const MAX_BIGINT = 10n ** 100n;
// Characters that could break or disguise a line of a log: controls, line separators, bidirectional
// marks and overrides, interlinear annotation marks, and the characters Unicode 16 says draw nothing
// (its default ignorables: zero-width spaces and joiners, the byte order mark, the soft hyphen,
// fillers, variation selectors, invisible operators, tag characters and the code points kept for
// more). A fixed list, since a Unicode property would depend on the engine's Unicode version; those
// past U+FFFF are matched as their pairs of code units.
const UNSAFE =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb]|\ud82f[\udca0-\udca3]|\ud834[\udd73-\udd7a]|[\udb40-\udb43][\udc00-\udfff]/g;
// The kinds of view on an ArrayBuffer, named by their constructors rather than by anything the value
// itself can define, such as its tag. A kind the engine lacks is left out.
const TYPED_ARRAYS = [
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float16Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'DataView',
].flatMap((name) => {
  const kind = (globalThis as Record<string, unknown>)[name];
  return typeof kind === 'function' ? [{ name, kind }] : [];
});

/**
 * A rejected value, for an error message, written the same way by every @borrowdale package.
 * Strings are quoted so `"10"` is visibly not the number 10, with characters that could disguise a
 * line written as escapes; a long string is described by its length. An array of up to 8 entries is
 * written in brackets, `[4, -1]`, its entries shown the same way but arrays and objects among them
 * only by kind; a longer array, a typed array and any other object is described by its kind, never
 * converted, since that could throw or run code from the input. A bigint keeps its `n`, and one
 * beyond ±1e100 is described by that bound; -0 keeps its sign.
 */
export function show(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > MAX_SHOWN ? `a string of ${value.length} characters` : escaped(JSON.stringify(value));
  }
  if (typeof value === 'object' && value !== null) {
    // Looking at an object can itself throw, from a revoked Proxy, a trap or a getter on its tag.
    try {
      return shownObject(value);
    } catch {
      return 'an object';
    }
  }
  if (typeof value === 'bigint') {
    return -MAX_BIGINT <= value && value <= MAX_BIGINT ? `${value}n` : 'a bigint beyond ±1e100';
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return `a ${typeof value}`;
  }
  return Object.is(value, -0) ? '-0' : String(value);
}

function shownObject(value: object): string {
  if (Array.isArray(value)) {
    // Its length read once: a Proxy could give another each time, or one that is not a number.
    const length = lengthOf(value);
    if (length === undefined) {
      return 'an array';
    }
    return length <= MAX_ENTRIES ? bracketed(value, length) : `an array of ${length}`;
  }
  if (ArrayBuffer.isView(value)) {
    const typed = TYPED_ARRAYS.find(({ kind }) => value instanceof (kind as abstract new () => unknown));
    // An Int8Array, Int16Array or Int32Array is read with "an", every other kind with "a".
    return typed === undefined ? 'a typed array' : `${typed.name.startsWith('Int') ? 'an' : 'a'} ${typed.name}`;
  }
  return 'an object';
}

// An array's length, read once, if it is a whole number.
function lengthOf(array: readonly unknown[]): number | undefined {
  const { length } = array;
  return Number.isSafeInteger(length) && length >= 0 ? length : undefined;
}

// By index, so a hole shows as undefined; an entry whose getter throws leaves only the length.
function bracketed(array: readonly unknown[], length: number): string {
  try {
    const entries = Array.from({ length }, (_, i) => {
      const entry = array[i];
      if (!Array.isArray(entry)) {
        return show(entry);
      }
      const inner = lengthOf(entry);
      return inner === undefined ? 'an array' : `an array of ${inner}`;
    });
    return `[${entries.join(', ')}]`;
  } catch {
    return `an array of ${length}`;
  }
}

/** `message` with every character that could break or disguise a line of a log written as its \u escape. */
export function escaped(message: string): string {
  return message.replace(UNSAFE, (found) =>
    Array.from({ length: found.length }, (_, i) => `\\u${found.charCodeAt(i).toString(16).padStart(4, '0')}`).join(''),
  );
}
