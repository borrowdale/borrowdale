import { describe, expect, it } from 'vitest';
import { escaped, show } from '@borrowdale/core/show';

// An array whose second entry throws when read, as a getter from code could.
const throwing = Object.defineProperty([1, 2], 1, {
  get() {
    throw new Error('read');
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
  ])('%s', (_case, value, shown) => {
    expect(show(value)).toBe(shown);
  });

  it('escapes every unsafe character in a message', () => {
    expect(escaped('a\nb\u2028c')).toBe('a\\u000ab\\u2028c');
  });
});
