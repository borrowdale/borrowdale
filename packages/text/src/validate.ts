import { excalifont } from './fonts/excalifont.js';
import {
  TEXT_ANCHORS,
  TEXT_BASELINES,
  type Font,
  type FontFile,
  type FontFiles,
  type LayoutOptions,
  type MeasureOptions,
  type TextAnchor,
  type TextBaseline,
  type TextStyle,
} from './types.js';

/** Text longer than this, in UTF-16 code units, is rejected. */
const MAX_LENGTH = 1000;
const MAX_COORDINATE = 1e6;
const MAX_FONT_SIZE = 1e4;
const MAX_ROTATE = 360;
const DEFAULT_FONT_SIZE = 16;

// The complete lists of accepted options: anything else is a typo.
const MEASURE_KEYS: Record<keyof MeasureOptions, true> = { fontSize: true, font: true };
const LAYOUT_KEYS: Record<keyof LayoutOptions, true> = {
  ...MEASURE_KEYS,
  x: true,
  y: true,
  anchor: true,
  baseline: true,
  rotate: true,
};
const STYLE_KEYS: Record<keyof TextStyle, true> = { fill: true };

// Bounds that keep every measurement finite. All but the lower bound of unitsPerEm (16 in
// OpenType) are OpenType's own ranges.
const FONT_NUMBERS = [
  ['unitsPerEm', 1, 16384],
  ['ascender', 0, 32767],
  ['descender', -32768, 0],
] as const;
const MAX_ADVANCE = 65535;

const ANCHORS: readonly unknown[] = TEXT_ANCHORS;
const BASELINES: readonly unknown[] = TEXT_BASELINES;

// Letters, digits, spaces, hyphens and underscores: nothing that can end a quoted CSS string.
const FAMILY = /^[A-Za-z0-9](?:[A-Za-z0-9 _-]*[A-Za-z0-9])?$/;
const FAMILY_RULE =
  'family must be letters, digits, spaces, hyphens and underscores, starting and ending with a letter or digit';
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/;
// Characters browsers draw as nothing (soft hyphens, zero-width joiners, variation selectors), so
// measured as nothing and served by no font file: Unicode's default-ignorable set, less the seven
// Chromium draws with a width from a fallback font (measured over all 4,174 of them): U+180F,
// U+3164, U+FFA0, U+1BCA0-1BCA3. Those count as uncovered. The whole set, without the exceptions,
// measures them wrongly as nothing.
export const IGNORABLE = /(?![\u180F\u3164\uFFA0\u{1BCA0}-\u{1BCA3}])\p{Default_Ignorable_Code_Point}/u;
// Removed from the text, because they change how their neighbours are drawn in ways the measurement
// cannot follow: variation selectors 15 and 16 switch a character between text and emoji
// presentation, and bidirectional controls reorder the text and mirror brackets.
const PRESENTATION_CONTROLS = /[\uFE0E\uFE0F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
// Characters an XML document cannot contain, so SVG markup holding them does not parse: C0 controls
// other than tab and the line breaks above, U+FFFE, U+FFFF and unpaired surrogates. With the `u`
// flag a surrogate pair is one character, so the surrogate range matches only unpaired halves.
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\uD800-\uDFFF]/u;
// A font that leaves out its files is one file, serving every code point it covers.
const ONE_FILE: CheckedFont['files'] = [{ ranges: [[0, 0x10ffff]] }];

/** A checked font: always one or more files, each with its own copy of the ranges it serves. */
export interface CheckedFont extends Font {
  files: readonly Pick<FontFile, 'ranges'>[];
}

export interface CheckedMeasure {
  text: string;
  fontSize: number;
  font: CheckedFont;
}

export interface CheckedLayout extends CheckedMeasure {
  x: number;
  y: number;
  anchor: TextAnchor;
  baseline: TextBaseline;
  rotate: number;
}

export function checkMeasure(text: unknown, options: MeasureOptions = {}): CheckedMeasure {
  checkKeys(options, MEASURE_KEYS);
  return measureInput(text, ownCopy(options));
}

export function checkLayout(text: unknown, given: LayoutOptions): CheckedLayout {
  checkKeys(given, LAYOUT_KEYS);
  const options = ownCopy(given);
  const { anchor = 'start', baseline = 'alphabetic', rotate = 0 } = options;
  if (!ANCHORS.includes(anchor)) {
    throw new Error(`Unknown anchor: ${show(anchor)}`);
  }
  if (!BASELINES.includes(baseline)) {
    throw new Error(`Unknown baseline: ${show(baseline)}`);
  }
  return {
    ...measureInput(text, options),
    x: checkNumber('x', options.x, -MAX_COORDINATE, MAX_COORDINATE),
    y: checkNumber('y', options.y, -MAX_COORDINATE, MAX_COORDINATE),
    anchor,
    baseline,
    rotate: checkNumber('rotate', rotate, -MAX_ROTATE, MAX_ROTATE),
  };
}

export function checkStyle(style: TextStyle = {}): { fill: string } {
  checkKeys(style, STYLE_KEYS);
  const { fill = '#000' } = ownCopy(style);
  if (typeof fill !== 'string') {
    throw new Error(`fill must be a string, got ${show(fill)}`);
  }
  checkXml('fill', fill);
  return { fill };
}

/** The advance of a code point in font units, or undefined when the font does not cover it. */
export function advanceOf(font: Font, codePoint: number): number | undefined {
  if (!Object.hasOwn(font.advances, codePoint)) {
    return undefined;
  }
  const advance: unknown = font.advances[codePoint];
  // Checked here rather than with checkNumber, so the message is only built when it is needed.
  if (typeof advance !== 'number' || !(advance >= 0 && advance <= MAX_ADVANCE)) {
    throw new Error(
      `Invalid font: the advance of ${codePointName(codePoint)} must be a number from 0 to ${MAX_ADVANCE}, got ${show(advance)}`,
    );
  }
  return advance;
}

export function checkFontFiles(fontFiles: FontFiles): void {
  if (typeof fontFiles !== 'object' || fontFiles === null || !Array.isArray(fontFiles.files)) {
    throw new Error('Invalid font files: expected { family, files }');
  }
  checkFamily(fontFiles.family, 'font files');
  for (const [index, file] of fontFiles.files.entries()) {
    if (typeof file?.woff2 !== 'string' || !BASE64.test(file.woff2) || file.woff2.length % 4 !== 0) {
      throw new Error(`Invalid font files: files[${index}].woff2 must be base64`);
    }
    checkRanges('font files', index, file.ranges);
  }
}

/** The text a caller asked to draw, checked, then changed into exactly what the browser draws. */
export function checkText(text: unknown): string {
  if (typeof text !== 'string') {
    throw new Error(`Text must be a string, got ${show(text)}`);
  }
  checkLength(text);
  if (LINE_BREAK.test(text)) {
    throw new Error('Text must be a single line');
  }
  checkXml('Text', text);
  // Checked first, changed second: a line break must be rejected, not turned into a space.
  const drawn = drawnForm(text);
  // Composing can also lengthen text (U+FB2C becomes three characters), so the drawn text is checked
  // too: the limit holds for whatever measuring returns.
  checkLength(drawn);
  return drawn;
}

function checkXml(name: string, value: string): void {
  const notXml = NOT_XML.exec(value);
  if (notXml) {
    throw new Error(`${name} contains ${codePointName(notXml[0].charCodeAt(0))}, which SVG cannot hold`);
  }
}

/**
 * A line of text as the browser draws it: presentation controls removed; accents composed (NFC),
 * because browsers draw "e" + U+0301 as "é", which can be a different width; and runs of spaces and
 * tabs collapsed and trimmed, because SVG draws a run of spaces as one. Measuring and choosing font
 * files both use it, so they always see the same characters.
 */
function drawnForm(text: string): string {
  return text
    .replace(PRESENTATION_CONTROLS, '')
    .normalize('NFC')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ | $/g, '');
}

function checkLength(text: string): void {
  if (text.length > MAX_LENGTH) {
    throw new Error(`Text is too long (more than ${MAX_LENGTH} characters)`);
  }
}

function measureInput(text: unknown, options: MeasureOptions): CheckedMeasure {
  const { fontSize = DEFAULT_FONT_SIZE, font = excalifont } = options;
  if (typeof fontSize !== 'number' || !(fontSize > 0 && fontSize <= MAX_FONT_SIZE)) {
    throw new Error(`fontSize must be a number greater than 0 and at most ${MAX_FONT_SIZE}, got ${show(fontSize)}`);
  }
  return { text: checkText(text), fontSize, font: checkFont(font) };
}

function checkFont(given: Font): CheckedFont {
  if (typeof given !== 'object' || given === null) {
    throw new Error(`Invalid font: expected an object, got ${show(given)}`);
  }
  // Each field read once: a getter cannot pass these checks and then return another value.
  const { family, unitsPerEm, ascender, descender, advances, files } = given;
  const font: Font = { family, unitsPerEm, ascender, descender, advances };
  checkFamily(font.family, 'font');
  if (typeof font.advances !== 'object' || font.advances === null) {
    throw new Error('Invalid font: advances must be an object');
  }
  for (const [name, min, max] of FONT_NUMBERS) {
    checkNumber(`Invalid font: ${name}`, font[name], min, max);
  }
  return { ...font, files: checkFiles(files) };
}

function checkFiles(files: unknown): CheckedFont['files'] {
  if (files === undefined) {
    return ONE_FILE;
  }
  // A font with no file would draw nothing.
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(`Invalid font: files must be a list of one or more files, got ${show(files)}`);
  }
  // Array.from rather than map, which skips the holes of a sparse list: a hole is checked, and fails.
  return Array.from(files, (file: { ranges?: unknown } | null | undefined, index) => ({
    ranges: checkRanges('font', index, file?.ranges),
  }));
}

// The same rule for a font's files and the woff2 files that hold them. Returns a copy of the
// ranges, copied first and checked second, which is what measuring reads: the pairs a font was
// checked with are the pairs it is measured with. Font files are trusted, and their callers read
// the ranges again.
function checkRanges(owner: string, index: number, ranges: unknown): [first: number, last: number][] {
  const pairs: unknown[] = Array.from(Array.isArray(ranges) ? ranges : [], (range: unknown) =>
    Array.isArray(range) ? [...range] : range,
  );
  // An empty list would make the face claim every code point.
  if (pairs.length === 0 || !pairs.every(isRange)) {
    throw new Error(`Invalid ${owner}: files[${index}].ranges must be one or more [first, last] code point pairs`);
  }
  return pairs;
}

function checkFamily(family: unknown, owner: string): void {
  if (typeof family !== 'string' || !FAMILY.test(family)) {
    throw new Error(`Invalid ${owner}: ${FAMILY_RULE}, got ${show(family)}`);
  }
}

// Only what checkKeys saw: own properties, in an object with no prototype, so neither an inherited
// option nor a polluted Object.prototype can supply a value.
function ownCopy<T extends object>(options: T): T {
  return Object.assign(Object.create(null) as T, options);
}

function checkKeys(options: unknown, keys: object): void {
  if (typeof options !== 'object' || options === null) {
    throw new Error(`Options must be an object, got ${show(options)}`);
  }
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && !Object.hasOwn(keys, key)) {
      throw new Error(`Unknown option: ${key}`);
    }
  }
}

function checkNumber(name: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !(value >= min && value <= max)) {
    throw new Error(`${name} must be a number from ${min} to ${max}, got ${show(value)}`);
  }
  return value;
}

function isRange(range: unknown): range is [first: number, last: number] {
  return (
    Array.isArray(range) &&
    range.length === 2 &&
    Number.isInteger(range[0]) &&
    Number.isInteger(range[1]) &&
    range[0] >= 0 &&
    range[0] <= range[1] &&
    range[1] <= 0x10ffff
  );
}

/** A checked family as a CSS string. Quoted, so a family named like a keyword (`serif`) stays a name. */
export function cssFamily(family: string): string {
  return `"${family}"`;
}

/** A character's code point. Iterating a string yields whole characters, so there always is one. */
export function codePointOf(character: string): number {
  return character.codePointAt(0) as number;
}

export function codePointName(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

// Unlike String(), never throws: an object without a prototype has no toString.
export function show(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (value === null) {
    return 'null';
  }
  return typeof value === 'object' || typeof value === 'function' ? typeof value : String(value);
}
