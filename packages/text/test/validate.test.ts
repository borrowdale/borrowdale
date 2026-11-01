import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fontFaceCss,
  layoutText,
  measureText,
  toSvgText,
  type FontFiles,
  type LayoutOptions,
  type MeasureOptions,
  type TextStyle,
} from '@borrowdale/text';
import { handFiles, handFont } from './support/hand-font.js';

const placed = { x: 0, y: 0 };
const FAMILY_RULE =
  'family must be letters, digits, spaces, hyphens and underscores, starting and ending with a letter or digit, got';

// Each returns the call, unmade, for `expect(...).toThrow`.
function measuring(text: unknown, options?: unknown) {
  return () => measureText(text as string, options as MeasureOptions);
}

function layingOut(text: unknown, options: unknown) {
  return () => layoutText(text as string, options as LayoutOptions);
}

function rendering(style: unknown) {
  return () => toSvgText(layoutText('A', placed), style as TextStyle);
}

function embedding(files: unknown, labels?: unknown) {
  return () => fontFaceCss(files as FontFiles, labels as string[]);
}

// A list that claims `length` entries and holds none: built at once, whatever the length.
function sparse(length: number): unknown[] {
  const list: unknown[] = [];
  list.length = length;
  return list;
}

function withFont(font: unknown) {
  return measuring('A', { font });
}

describe('text', () => {
  it.each<[string, unknown, string]>([
    ['a number', 42, 'Text must be a string, got 42'],
    ['an object', {}, 'Text must be a string, got an object'],
    ['missing', undefined, 'Text must be a string, got undefined'],
    ['one character too long', 'A'.repeat(1001), 'Text is too long (more than 1000 characters)'],
    ['text that composing makes too long', '\uFB2C'.repeat(334), 'Text is too long (more than 1000 characters)'],
    ['text too long, before checking its lines', 'a\n'.repeat(600), 'Text is too long (more than 1000 characters)'],
    ['a line feed', 'a\nb', 'Text must be a single line'],
    ['a carriage return', 'a\rb', 'Text must be a single line'],
    ['a next-line character', 'a\u0085b', 'Text must be a single line'],
    ['a line separator', 'a\u2028b', 'Text must be a single line'],
    ['a paragraph separator', 'a\u2029b', 'Text must be a single line'],
    ['a NUL', 'a\u0000b', 'Text contains U+0000, which SVG cannot hold'],
    ['a backspace', 'a\u0008b', 'Text contains U+0008, which SVG cannot hold'],
    ['a vertical tab', 'a\u000Bb', 'Text contains U+000B, which SVG cannot hold'],
    ['a form feed', 'a\u000Cb', 'Text contains U+000C, which SVG cannot hold'],
    ['a shift out', 'a\u000Eb', 'Text contains U+000E, which SVG cannot hold'],
    ['a unit separator', 'a\u001Fb', 'Text contains U+001F, which SVG cannot hold'],
    ['U+FFFE', 'a\uFFFEb', 'Text contains U+FFFE, which SVG cannot hold'],
    ['U+FFFF', 'a\uFFFFb', 'Text contains U+FFFF, which SVG cannot hold'],
    ['an unpaired high surrogate', 'a\uD800b', 'Text contains U+D800, which SVG cannot hold'],
    ['an unpaired low surrogate', 'a\uDC00b', 'Text contains U+DC00, which SVG cannot hold'],
    ['a high surrogate at the end', 'a\uD83D', 'Text contains U+D83D, which SVG cannot hold'],
  ])('rejects %s', (_case, text, message) => {
    expect(measuring(text)).toThrow(message);
  });

  it('accepts a tab, which SVG draws as a space', () => {
    expect(measureText('A\tA', { font: handFont, fontSize: 10 }).text).toBe('A A');
  });

  it('accepts a paired surrogate', () => {
    expect(measureText('😀', { font: handFont, fontSize: 10 }).missing).toEqual(['😀']);
  });
});

describe('measure options', () => {
  it.each<[string, unknown, string]>([
    ['null', null, 'Options must be an object, got null'],
    ['a string', 'big', 'Options must be an object, got "big"'],
    ['an unknown key', { fontSzie: 12 }, 'Unknown option: "fontSzie"'],
    ['a layout key', { x: 1 }, 'Unknown option: "x"'],
    ['a key every object inherits', { constructor: 1 }, 'Unknown option: "constructor"'],
    ['fontSize 0', { fontSize: 0 }, 'fontSize must be a number greater than 0 and at most 10000, got 0'],
    ['a negative fontSize', { fontSize: -1 }, 'fontSize must be a number greater than 0 and at most 10000, got -1'],
    ['fontSize over 10000', { fontSize: 10000.5 }, 'fontSize must be a number greater than 0 and at most 10000, got 10000.5'],
    ['a NaN fontSize', { fontSize: NaN }, 'fontSize must be a number greater than 0 and at most 10000, got NaN'],
    ['fontSize as a string', { fontSize: '16' }, 'fontSize must be a number greater than 0 and at most 10000, got "16"'],
  ])('rejects %s', (_case, options, message) => {
    expect(measuring('A', options)).toThrow(message);
  });

  it('accepts the largest fontSize', () => {
    expect(measureText('A', { fontSize: 10000, font: handFont }).width).toBe(5000);
  });

  it('ignores an option the options only inherit', () => {
    expect(measureText('A', Object.create({ font: { ...handFont, unitsPerEm: 1 } }) as MeasureOptions)).toEqual(
      measureText('A'),
    );
  });

  it('treats an option set to undefined as not set', () => {
    expect(measureText('A', { fontSize: undefined, font: handFont })).toEqual(measureText('A', { font: handFont, fontSize: 16 }));
  });

  it('ignores an unknown key whose value is undefined', () => {
    expect(measureText('A', { font: handFont, extra: undefined } as MeasureOptions).width).toBe(8);
  });
});

describe('fonts', () => {
  it.each<[string, unknown, string]>([
    ['null', null, 'Invalid font: expected an object, got null'],
    ['a family name instead of a font', 'Excalifont', 'Invalid font: expected an object, got "Excalifont"'],
    ['a family with a quote', { ...handFont, family: 'A"B' }, `Invalid font: ${FAMILY_RULE} "A\\"B"`],
    ['a family with a backslash', { ...handFont, family: 'A\\B' }, `Invalid font: ${FAMILY_RULE} "A\\\\B"`],
    ['an empty family', { ...handFont, family: '' }, `Invalid font: ${FAMILY_RULE} ""`],
    ['a family ending in a space', { ...handFont, family: 'A ' }, `Invalid font: ${FAMILY_RULE} "A "`],
    ['no family', { ...handFont, family: undefined }, `Invalid font: ${FAMILY_RULE} undefined`],
    ['no advances', { ...handFont, advances: null }, 'Invalid font: advances must be an object'],
    ['advances that are a number', { ...handFont, advances: 5 }, 'Invalid font: advances must be an object'],
    ['unitsPerEm 0', { ...handFont, unitsPerEm: 0 }, 'Invalid font: unitsPerEm must be a number from 1 to 16384, got 0'],
    ['a tiny unitsPerEm', { ...handFont, unitsPerEm: 5e-324 }, 'Invalid font: unitsPerEm must be a number from 1 to 16384, got 5e-324'],
    ['unitsPerEm over 16384', { ...handFont, unitsPerEm: 16385 }, 'Invalid font: unitsPerEm must be a number from 1 to 16384, got 16385'],
    ['an infinite unitsPerEm', { ...handFont, unitsPerEm: Infinity }, 'Invalid font: unitsPerEm must be a number from 1 to 16384, got Infinity'],
    ['a negative ascender', { ...handFont, ascender: -1 }, 'Invalid font: ascender must be a number from 0 to 32767, got -1'],
    ['an ascender over 32767', { ...handFont, ascender: 32768 }, 'Invalid font: ascender must be a number from 0 to 32767, got 32768'],
    ['a positive descender', { ...handFont, descender: 1 }, 'Invalid font: descender must be a number from -32768 to 0, got 1'],
    ['a descender below -32768', { ...handFont, descender: -32769 }, 'Invalid font: descender must be a number from -32768 to 0, got -32769'],
    ['a descender as a string', { ...handFont, descender: '-2' }, 'Invalid font: descender must be a number from -32768 to 0, got "-2"'],
    ['files that are not a list', { ...handFont, files: 'latin' }, 'Invalid font: files must be a list of one or more files, got "latin"'],
    ['an empty list of files', { ...handFont, files: [] }, 'Invalid font: files must be a list of one or more files, got []'],
    ['a list of files with a hole', { ...handFont, files: [, { ranges: [[0x41, 0x41]] }] }, 'Invalid font: files[0].ranges must be'],
    ['a file whose ranges have a hole', { ...handFont, files: [{ ranges: [, [0x41, 0x41]] }] }, 'Invalid font: files[0].ranges must be'],
    ['a pair claiming 2^32-1 ends', { ...handFont, files: [{ ranges: [sparse(2 ** 32 - 1)] }] }, 'Invalid font: files[0].ranges must be'],
    ['a bad pair after a good one', { ...handFont, files: [{ ranges: [[0x41, 0x41], [0x42, 0x41]] }] }, 'Invalid font: files[0].ranges must be'],
    ['ranges claiming 2^32-1 pairs', { ...handFont, files: [{ ranges: sparse(2 ** 32 - 1) }] }, 'Invalid font: files[0].ranges must be'],
    ['a file with no ranges', { ...handFont, files: [{ ranges: [] }] }, 'Invalid font: files[0].ranges must be one or more [first, last] code point pairs'],
    ['a null file', { ...handFont, files: [{ ranges: [[0x41, 0x42]] }, null] }, 'Invalid font: files[1].ranges must be one or more'],
    ['a file range that runs backwards', { ...handFont, files: [{ ranges: [[0x42, 0x41]] }] }, 'Invalid font: files[0].ranges must be'],
  ])('rejects %s', (_case, font, message) => {
    expect(withFont(font)).toThrow(message);
  });

  it.each<[string, unknown, string]>([
    ['negative', -1, 'Invalid font: the advance of U+0041 must be a number from 0 to 65535, got -1'],
    ['over 65535', 65536, 'Invalid font: the advance of U+0041 must be a number from 0 to 65535, got 65536'],
    ['huge', 1e308, 'Invalid font: the advance of U+0041 must be a number from 0 to 65535, got 1e+308'],
    ['NaN', NaN, 'Invalid font: the advance of U+0041 must be a number from 0 to 65535, got NaN'],
    ['infinite', Infinity, 'Invalid font: the advance of U+0041 must be a number from 0 to 65535, got Infinity'],
    ['a string', '5', 'Invalid font: the advance of U+0041 must be a number from 0 to 65535, got "5"'],
  ])('rejects an advance that is %s', (_case, advance, message) => {
    expect(withFont({ ...handFont, advances: { 0x41: advance } })).toThrow(message);
  });

  it('accepts the largest values a font may have, and measures them as finite numbers', () => {
    expect(
      measureText('AA', {
        font: { ...handFont, unitsPerEm: 1, ascender: 32767, descender: -32768, advances: { 0x41: 65535 } },
        fontSize: 10000,
      }),
    ).toMatchObject({ width: 1310700000, ascent: 327670000, descent: 327680000 });
  });

  it('accepts a font whose ascender and descender are both 0', () => {
    expect(measureText('A', { font: { ...handFont, ascender: 0, descender: 0 }, fontSize: 10 })).toMatchObject({
      ascent: 0,
      descent: 0,
    });
  });

  it('accepts a font that leaves its files undefined', () => {
    expect(measureText('A', { font: { ...handFont, files: undefined }, fontSize: 10 })).toMatchObject({ width: 5, missing: [] });
  });

  it('accepts a family made of several words', () => {
    expect(measureText('A', { font: { ...handFont, family: 'Hand_Test-2 Bold' }, fontSize: 10 }).width).toBe(5);
  });
});

describe('layout options', () => {
  it.each<[string, unknown, string]>([
    ['missing options', undefined, 'Options must be an object, got undefined'],
    ['no x', { y: 0 }, 'x must be a number from -1000000 to 1000000, got undefined'],
    ['no y', { x: 0 }, 'y must be a number from -1000000 to 1000000, got undefined'],
    ['x as a string', { ...placed, x: '5' }, 'x must be a number from -1000000 to 1000000, got "5"'],
    ['x past the limit', { ...placed, x: 1000000.5 }, 'x must be a number from -1000000 to 1000000, got 1000000.5'],
    ['y below the limit', { ...placed, y: -1000000.5 }, 'y must be a number from -1000000 to 1000000, got -1000000.5'],
    ['a NaN y', { ...placed, y: NaN }, 'y must be a number from -1000000 to 1000000, got NaN'],
    ['an unknown anchor', { ...placed, anchor: 'left' }, 'Unknown anchor: "left"'],
    ['an anchor that is not a string', { ...placed, anchor: 1 }, 'Unknown anchor: 1'],
    ['an unknown baseline', { ...placed, baseline: 'hanging' }, 'Unknown baseline: "hanging"'],
    ['rotate past a full turn', { ...placed, rotate: 360.5 }, 'rotate must be a number from -360 to 360, got 360.5'],
    ['rotate below a full turn', { ...placed, rotate: -360.5 }, 'rotate must be a number from -360 to 360, got -360.5'],
    ['a NaN rotate', { ...placed, rotate: NaN }, 'rotate must be a number from -360 to 360, got NaN'],
    ['a style key', { ...placed, fill: 'red' }, 'Unknown option: "fill"'],
  ])('rejects %s', (_case, options, message) => {
    expect(layingOut('A', options)).toThrow(message);
  });

  it('ignores an inherited x, so a layout without its own x is rejected', () => {
    expect(layingOut('A', Object.assign(Object.create({ x: 5 }), { y: 0 }))).toThrow(
      'x must be a number from -1000000 to 1000000, got undefined',
    );
  });

  it('ignores an inherited baseline', () => {
    expect(layoutText('A', Object.assign(Object.create({ baseline: 'top' }), placed) as LayoutOptions).y).toBe(0);
  });

  it('ignores a layout option the options only inherit', () => {
    expect(layoutText('A', Object.assign(Object.create({ rotate: 90, anchor: 'end' }), placed) as LayoutOptions)).toMatchObject({
      x: 0,
      rotate: 0,
    });
  });

  it('accepts the limits themselves', () => {
    expect(layoutText('', { x: -1000000, y: 1000000, rotate: -360 })).toMatchObject({ x: -1000000, y: 1000000, rotate: -360 });
  });

  it('checks the text as measureText does', () => {
    expect(layingOut('a\nb', placed)).toThrow('Text must be a single line');
  });
});

describe('a polluted Object.prototype', () => {
  beforeEach(() => {
    Object.defineProperty(Object.prototype, 'baseline', { value: 'top', configurable: true, writable: true });
    Object.defineProperty(Object.prototype, 'fontSize', { value: 500, configurable: true, writable: true });
    Object.defineProperty(Object.prototype, 'fill', { value: 'red', configurable: true, writable: true });
    Object.defineProperty(Object.prototype, 'files', { value: [{ ranges: [[0, 0]] }], configurable: true, writable: true });
  });

  afterEach(() => {
    delete (Object.prototype as { baseline?: unknown }).baseline;
    delete (Object.prototype as { fontSize?: unknown }).fontSize;
    delete (Object.prototype as { fill?: unknown }).fill;
    delete (Object.prototype as { files?: unknown }).files;
  });

  it('cannot supply a layout option', () => {
    expect(layoutText('A', placed).y).toBe(0);
  });

  it('cannot supply a measuring option', () => {
    expect(measureText('A', { font: handFont }).width).toBe(8);
  });

  it('cannot supply the files of a font', () => {
    expect(measureText('A', { fontSize: 10, font: handFont }).missing).toEqual([]);
  });

  it('cannot supply a style', () => {
    expect(toSvgText(layoutText('A', placed), {})).toContain(' fill="#000" ');
  });
});

describe('style', () => {
  it('ignores an inherited fill', () => {
    expect(toSvgText(layoutText('A', placed), Object.create({ fill: 'red' }) as TextStyle)).toBe(
      toSvgText(layoutText('A', placed)),
    );
  });

  it('names a function as a function, not its source', () => {
    expect(rendering({ fill: String })).toThrow(/^fill must be a string, got a function$/);
  });

  it.each<[string, unknown, string]>([
    ['null', null, 'Options must be an object, got null'],
    ['a fill that is not a string', { fill: 1 }, 'fill must be a string, got 1'],
    ['a fill that is a function', { fill: String }, 'fill must be a string, got a function'],
    ['a fill with a NUL', { fill: 'red\u0000' }, 'fill contains U+0000, which SVG cannot hold'],
    ['a fill with an unpaired surrogate', { fill: '\uD800' }, 'fill contains U+D800, which SVG cannot hold'],
    ['an unknown key', { stroke: 'red' }, 'Unknown option: "stroke"'],
  ])('rejects %s', (_case, style, message) => {
    expect(rendering(style)).toThrow(message);
  });
});

describe('font files', () => {
  it.each<[string, unknown, string]>([
    ['null', null, 'Invalid font files: expected { family, files }'],
    ['no files', { family: 'Hand Test' }, 'Invalid font files: expected { family, files }'],
    ['a bad family', { ...handFiles, family: 'a;b' }, `Invalid font files: ${FAMILY_RULE} "a;b"`],
    ['woff2 that is not base64', { ...handFiles, files: [{ ranges: [[0x41, 0x41]], woff2: 'AB)}</style>' }] }, 'Invalid font files: files[0].woff2 must be base64'],
    ['a file without woff2', { ...handFiles, files: [{ ranges: [[0x41, 0x41]] }] }, 'Invalid font files: files[0].woff2 must be base64'],
    ['a null file', { ...handFiles, files: [null] }, 'Invalid font files: files[0].woff2 must be base64'],
    ['woff2 that would close url(', { ...handFiles, files: [{ ranges: [[0x41, 0x41]], woff2: 'QQ==)' }] }, 'Invalid font files: files[0].woff2 must be base64'],
    ['woff2 of a length base64 cannot have', { ...handFiles, files: [{ ranges: [[0x41, 0x41]], woff2: 'A' }] }, 'Invalid font files: files[0].woff2 must be base64'],
    ['woff2 with three padding characters', { ...handFiles, files: [{ ranges: [[0x41, 0x41]], woff2: 'QQ===' }] }, 'Invalid font files: files[0].woff2 must be base64'],
    ['woff2 padded to length with three padding characters', { ...handFiles, files: [{ ranges: [[0x41, 0x41]], woff2: 'Q===' }] }, 'Invalid font files: files[0].woff2 must be base64'],
    ['no ranges at all', { ...handFiles, files: [{ ranges: [], woff2: 'QQ==' }] }, 'Invalid font files: files[0].ranges must be one or more [first, last] code point pairs'],
    ['a range with three ends', { ...handFiles, files: [{ ranges: [[0x41, 0x42, 0x43]], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['a range that runs backwards', { ...handFiles, files: [{ ranges: [[0x42, 0x41]], woff2: 'QQ==' }] }, 'Invalid font files: files[0].ranges must be one or more [first, last] code point pairs'],
    ['a range past U+10FFFF', { ...handFiles, files: [{ ranges: [[0x41, 0x110000]], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['a negative range', { ...handFiles, files: [{ ranges: [[-1, 0x41]], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['a fractional last code point', { ...handFiles, files: [{ ranges: [[0x41, 65.5]], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['a fractional first code point', { ...handFiles, files: [{ ranges: [[64.5, 0x41]], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['a range with one end', { ...handFiles, files: [{ ranges: [[0x41]], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['ranges that are not a list', { ...handFiles, files: [{ ranges: 'A-B', woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['ranges with a hole', { ...handFiles, files: [{ ranges: [, [0x41, 0x41]], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['ranges that are only a hole', { ...handFiles, files: [{ ranges: [,], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['a pair claiming 2^32-1 ends', { ...handFiles, files: [{ ranges: [sparse(2 ** 32 - 1)], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['a bad pair after a good one', { ...handFiles, files: [{ ranges: [[0x41, 0x41], [0x42, 0x41]], woff2: 'QQ==' }] }, 'files[0].ranges must be'],
    ['an empty list of files', { ...handFiles, files: [] }, 'Invalid font files: files must be a list of one or more files'],
  ])('rejects %s', (_case, files, message) => {
    expect(embedding(files)).toThrow(message);
  });

  it('rejects labels given as one string rather than a list', () => {
    expect(embedding(handFiles, 'Zürich')).toThrow('Labels must be an array, got string');
  });

  it('rejects a label that is not a string', () => {
    expect(embedding(handFiles, ['A', 42])).toThrow('Text must be a string, got 42');
  });

  it('rejects a label of more than one line, as layoutText does', () => {
    expect(embedding(handFiles, ['A\nB'])).toThrow('Text must be a single line');
  });

  it('accepts a range starting at U+0000', () => {
    expect(fontFaceCss({ ...handFiles, files: [{ ranges: [[0, 0x41]], woff2: 'QQ==' }] })).toContain(
      'unicode-range:U+0000-0041}',
    );
  });

  it('serves characters above U+FFFF from their range', () => {
    expect(fontFaceCss({ ...handFiles, files: [{ ranges: [[0x1f600, 0x1f64f]], woff2: 'QQ==' }] }, ['\u{1F600}'])).toContain(
      'unicode-range:U+1F600-1F64F}',
    );
  });

  it('accepts the last code point', () => {
    expect(fontFaceCss({ ...handFiles, files: [{ ranges: [[0x10ffff, 0x10ffff]], woff2: 'QQ==' }] })).toContain(
      'unicode-range:U+10FFFF}',
    );
  });
});
