import { describe, expect, it } from 'vitest';
import { escaped, show } from '@borrowdale/core/show';

// An array whose second entry throws when read, as a getter from code could.
const throwing = Object.defineProperty([1, 2], 1, {
  get() {
    throw new Error('read');
  },
});

// Objects that throw when looked at: a revoked Proxy, a Proxy whose every read throws, and a typed
// array whose tag throws.
const { proxy: revoked, revoke } = Proxy.revocable([], {});
revoke();
const trapped = new Proxy([1, 2], {
  get() {
    throw new Error('read');
  },
});
class ThrowingTag extends Uint8Array {
  get [Symbol.toStringTag](): 'Uint8Array' {
    throw new Error('tag');
  }
}
// An array whose length is 3 when first read and a million after, and one whose length is text.
let lengthReads = 0;
const growing = new Proxy([1, 2, 3], {
  get(target, key) {
    if (key === 'length') {
      lengthReads += 1;
      return lengthReads === 1 ? 3 : 1_000_000;
    }
    return Reflect.get(target, key);
  },
});
const wordy = new Proxy([1], {
  get(target, key) {
    return key === 'length' ? '\u202e3' : Reflect.get(target, key);
  },
});

describe('show', () => {
  it.each<[string, unknown, string]>([
    ['quotes a string, so a number in it is visibly a string', '10', '"10"'],
    ['escapes a character that could disguise a line', 'a\u202eb', '"a\\u202eb"'],
    ['describes a long string by its length', 'x'.repeat(101), 'a string of 101 characters'],
    ['writes a short array in brackets', [4, -1], '[4, -1]'],
    ['writes an empty array', [], '[]'],
    ['shows a string in an array as a string', [4, '2'], '[4, "2"]'],
    ['shows a hole in an array as undefined', [4, , 2], '[4, undefined, 2]'],
    ['names an array or object in an array only by its kind', [[1, 2], { a: 1 }], '[an array of 2, an object]'],
    ['describes an array of more than 8 entries by its length', Array.from({ length: 9 }, () => 1), 'an array of 9'],
    ['describes an array whose entry throws by its length', throwing, 'an array of 2'],
    ['names a typed array, which would otherwise read as numbers', new Float64Array([4, 2]), 'a Float64Array'],
    ['describes an object by its kind', { toString: () => 'x' }, 'an object'],
    ['describes an object without a prototype', Object.create(null), 'an object'],
    ['keeps the n of a bigint', 5n, '5n'],
    ['keeps the sign of -0', -0, '-0'],
    ['names a function', String, 'a function'],
    ['names a symbol', Symbol('s'), 'a symbol'],
    ['writes null', null, 'null'],
    ['writes undefined', undefined, 'undefined'],
    ['writes a number', 1.5, '1.5'],
    ['writes NaN', Number.NaN, 'NaN'],
    ['describes a revoked Proxy as an object', revoked, 'an object'],
    ['describes an array whose length throws as an object', trapped, 'an object'],
    ['names a typed array by its kind, whatever its tag does', new ThrowingTag(1), 'a Uint8Array'],
    ['reads the length of an array once', growing, '[1, 2, 3]'],
    ['describes an array whose length is not a whole number only as an array', wordy, 'an array'],
    ['writes a string of 100 characters in full', 'x'.repeat(100), `"${'x'.repeat(100)}"`],
    ['writes an array of 8 entries in brackets', [1, 2, 3, 4, 5, 6, 7, 8], '[1, 2, 3, 4, 5, 6, 7, 8]'],
  ])('%s', (_case, value, shown) => {
    expect(show(value)).toBe(shown);
  });

  it.each<[string, string, string]>([
    ['a line break', 'a\nb', 'a\\u000ab'],
    ['a line separator', 'a\u2028b', 'a\\u2028b'],
    ['a C1 control', 'a\u0085b', 'a\\u0085b'],
    ['a direction mark', 'a\u200fb', 'a\\u200fb'],
    ['a direction override', 'a\u202eb', 'a\\u202eb'],
    ['a direction isolate', 'a\u2066b', 'a\\u2066b'],
    ['an Arabic letter mark', 'a\u061cb', 'a\\u061cb'],
    ['a zero-width space', 'a\u200bb', 'a\\u200bb'],
    ['a byte order mark', 'a\ufeffb', 'a\\ufeffb'],
    ['a soft hyphen', 'a\u00adb', 'a\\u00adb'],
    ['a tag character, a pair of code units', 'a\u{E0041}b', 'a\\udb40\\udc41b'],
  ])('escapes %s in a message', (_case, message, written) => {
    expect(escaped(message)).toBe(written);
  });
});
