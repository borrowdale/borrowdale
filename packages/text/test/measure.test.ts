import { describe, expect, it } from 'vitest';
import {
  excalifont,
  layoutText,
  measureText,
  type Font,
  type FontFile,
  type TextAnchor,
  type TextBaseline,
} from '@borrowdale/text';
import { excalifontFiles } from '@borrowdale/text/excalifont-files';
import { at, handFont, splitFont } from './support/hand-font.js';

// Characters drawn as nothing but switching their neighbours' presentation or order: removed.
const PRESENTATION_CONTROLS = ['\uFE0E', '\uFE0F', '\u061C', '\u200E', '\u200F', '\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069'];
// Default-ignorable characters Chromium nevertheless draws with a width, from a fallback font. There
// are seven: U+180F, a combining mark, has its own test below, listed with the character before it.
const VISIBLE_IGNORABLES = ['\u3164', '\uFFA0', '\u{1BCA0}', '\u{1BCA1}', '\u{1BCA2}', '\u{1BCA3}'];
// Read as 10 the first time and 1 after: a font that would change between checking and measuring.
function shiftingFont(): Font {
  let reads = 0;
  return {
    ...handFont,
    get unitsPerEm() {
      reads += 1;
      return reads === 1 ? 10 : 1;
    },
  };
}

// A font in one file whose ranges serve A, B and U+0301 the first time they are read, and only A after.
function fontWithShiftingFiles(): Font {
  let reads = 0;
  return {
    ...handFont,
    files: [
      {
        get ranges(): FontFile['ranges'] {
          reads += 1;
          return reads === 1 ? [[0x41, 0x42], [0x0301, 0x0301]] : [[0x41, 0x41]];
        },
      },
    ],
  };
}

describe('measureText', () => {
  it('adds up the advances and scales them to the font size', () => {
    expect(measureText('AB', { fontSize: 20, font: handFont })).toEqual({
      text: 'AB',
      width: 24,
      ascent: 16,
      descent: 4,
      missing: [],
    });
  });

  it('measures in Excalifont at 16 by default', () => {
    expect(measureText('Hello')).toEqual({ text: 'Hello', width: 34.56, ascent: 14.18, descent: 5.98, missing: [] });
  });

  it('uses Excalifont when the options leave the font out', () => {
    expect(measureText('Hello', { fontSize: 16, font: excalifont })).toEqual(measureText('Hello', { fontSize: 16 }));
  });

  it('counts a character the font does not cover as 1 em and lists it', () => {
    expect(measureText('A東', { fontSize: 10, font: handFont })).toEqual({
      text: 'A東',
      width: 15,
      ascent: 8,
      descent: 2,
      missing: ['東'],
    });
  });

  it('lists each uncovered character once, in the order they first appear', () => {
    expect(measureText('東京東', { fontSize: 10, font: handFont }).missing).toEqual(['東', '京']);
  });

  it('still counts a repeated uncovered character every time it appears', () => {
    expect(measureText('東京東', { fontSize: 10, font: handFont }).width).toBe(30);
  });

  it('counts a character outside the Basic Multilingual Plane once', () => {
    expect(measureText('😀', { fontSize: 10, font: handFont })).toMatchObject({ width: 10, missing: ['😀'] });
  });

  it('gives a combining mark the width the font gives it', () => {
    expect(measureText('B\u0301', { fontSize: 10, font: handFont }).width).toBe(7);
  });

  it('composes a letter and its accent into one character, as browsers draw them', () => {
    expect(measureText('Cafe\u0301').text).toBe('Caf\u00E9');
  });

  it('measures a soft hyphen, which browsers do not draw, as nothing', () => {
    expect(measureText('A\u00ADB', { fontSize: 10, font: handFont })).toMatchObject({ width: 12, missing: [] });
  });

  it('measures a zero-width joiner as nothing and does not list it as uncovered', () => {
    expect(measureText('A\u200DB', { fontSize: 10, font: handFont })).toMatchObject({ width: 12, missing: [] });
  });

  it('counts a Hangul filler, which browsers draw with a width, as uncovered', () => {
    expect(measureText('A\u3164B', { fontSize: 10, font: handFont })).toMatchObject({ width: 22, missing: ['\u3164'] });
  });

  it('removes variation selectors 15 and 16, which switch characters to and from emoji', () => {
    expect(measureText('1\uFE0F2\uFE0E').text).toBe('12');
  });

  it.each(PRESENTATION_CONTROLS)('removes %j from the text', (control) => {
    expect(measureText(`A${control}B`, { fontSize: 10, font: handFont }).text).toBe('AB');
  });

  it.each(VISIBLE_IGNORABLES)('counts %j, which Chromium draws with a width, as uncovered', (character) => {
    expect(measureText(`A${character}B`, { fontSize: 10, font: handFont })).toMatchObject({ width: 22, missing: [character] });
  });

  it('counts U+180F, a mark Chromium draws with a width, as uncovered, with the character it follows', () => {
    expect(measureText('A\u180FB', { fontSize: 10, font: handFont })).toMatchObject({ width: 22, missing: ['A\u180F'] });
  });

  it('removes presentation controls before composing, so a letter and its accent still join', () => {
    expect(measureText('o\u200E\u030B').text).toBe('\u0151');
  });

  it('removes presentation controls before collapsing spaces', () => {
    expect(measureText('a \u200E b').text).toBe('a b');
  });

  it('reads each number of the font once, so the font it checked is the font it measures with', () => {
    expect(measureText('A', { fontSize: 10, font: shiftingFont() }).width).toBe(5);
  });

  it('removes bidirectional controls, which reorder the drawn text', () => {
    expect(measureText('\u202EAB\u202C\u200F').text).toBe('AB');
  });

  it('measures a character above U+FFFF from its own advance', () => {
    expect(
      measureText('\u{1F600}', { fontSize: 10, font: { ...handFont, advances: { ...handFont.advances, 0x1f600: 4 } } }),
    ).toMatchObject({ width: 4, missing: [] });
  });

  it('measures the soft hyphen Excalifont has a glyph for as nothing too', () => {
    expect(measureText('Ex\u00ADample').width).toBe(measureText('Example').width);
  });

  it('counts the composed character, not its parts, as uncovered', () => {
    expect(measureText('A\u0301', { fontSize: 10, font: handFont })).toMatchObject({ text: '\u00C1', missing: ['\u00C1'] });
  });

  it('ignores an advance the font only inherits', () => {
    const inherited: Font = { ...handFont, advances: Object.create({ 0x41: 5 }) as Font['advances'] };

    expect(measureText('A', { fontSize: 10, font: inherited })).toMatchObject({ width: 10, missing: ['A'] });
  });

  it('lists a character and its mark when they come from different files, which the browser draws in a fallback font', () => {
    expect(measureText('AB\u0301', { fontSize: 10, font: splitFont })).toMatchObject({ width: 12, missing: ['B\u0301'] });
  });

  it('measures a character and its mark from different files at the font widths', () => {
    expect(measureText('B\u0301', { fontSize: 10, font: splitFont }).width).toBe(7);
  });

  it('does not list a character and its mark that come from the same file', () => {
    const oneFile: Font = { ...splitFont, files: [{ ranges: [[0x41, 0x42], [0x0301, 0x0301]] }] };

    expect(measureText('B\u0301', { fontSize: 10, font: oneFile })).toMatchObject({ width: 7, missing: [] });
  });

  it('treats a font that leaves out its files as one file', () => {
    expect(measureText('B\u0301', { fontSize: 10, font: handFont })).toMatchObject({ width: 7, missing: [] });
  });

  it('reads the ranges of each file once, so the ranges it checked are the ranges it measures with', () => {
    expect(measureText('B\u0301', { fontSize: 10, font: fontWithShiftingFiles() }).missing).toEqual([]);
  });

  it('lists each character and mark from different files once', () => {
    expect(measureText('B\u0301AB\u0301', { fontSize: 10, font: splitFont }).missing).toEqual(['B\u0301']);
  });

  it('lists a Cyrillic letter with a stress mark, which Excalifont keeps in another file', () => {
    expect(measureText('приве\u0301т')).toMatchObject({ width: 50.51, missing: ['е\u0301'] });
  });

  it('does not list a character and a mark from the same Excalifont file', () => {
    expect(measureText('\u212E\u0302').missing).toEqual([]);
  });

  it('keeps a zero-width joiner between a character and its mark in their cluster', () => {
    expect(measureText('B\u200D\u0301', { fontSize: 10, font: splitFont }).missing).toEqual(['B\u200D\u0301']);
  });

  it('keeps a zero-width joiner with the character before it, so that character may be listed twice', () => {
    expect(measureText('東\u200DA東', { fontSize: 10, font: handFont }).missing).toEqual(['東\u200D', '東']);
  });

  it('ends the cluster at a soft hyphen, so a mark after it is drawn on its own', () => {
    expect(measureText('B\u00AD\u0301', { fontSize: 10, font: splitFont }).missing).toEqual([]);
  });

  it('skips a default-ignorable mark when it finds the files of a cluster', () => {
    expect(measureText('B\uFE00', { fontSize: 10, font: splitFont }).missing).toEqual([]);
  });

  it('lists marks at the start of the text from different files as one cluster', () => {
    expect(measureText('\u0301\u0302A').missing).toEqual(['\u0301\u0302']);
  });

  it('lists a character the font lacks with the marks after it', () => {
    expect(measureText('A東\u0301', { fontSize: 10, font: handFont })).toMatchObject({ width: 15, missing: ['東\u0301'] });
  });

  it('lists a character that has an advance but no file of the font serves', () => {
    const noSpace: Font = { ...splitFont, files: [{ ranges: [[0x41, 0x42]] }] };

    expect(measureText('A B', { fontSize: 10, font: noSpace })).toMatchObject({ width: 15, missing: [' '] });
  });

  it('collapses runs of spaces and tabs to one space, as SVG draws them', () => {
    expect(measureText('A \t  B', { fontSize: 10, font: handFont })).toMatchObject({ text: 'A B', width: 15 });
  });

  it('drops a space at either end', () => {
    expect(measureText(' A ', { fontSize: 10, font: handFont })).toMatchObject({ text: 'A', width: 5 });
  });

  it('keeps a no-break space, which SVG does not collapse', () => {
    expect(measureText('a\u00A0\u00A0b').text).toBe('a\u00A0\u00A0b');
  });

  it('measures empty text as zero wide', () => {
    expect(measureText('', { fontSize: 10, font: handFont })).toMatchObject({ text: '', width: 0, missing: [] });
  });

  it('rounds to two decimals', () => {
    expect(measureText('A', { fontSize: 1.234, font: handFont }).width).toBe(0.62);
  });

  it('measures the longest text it accepts', () => {
    expect(measureText('A'.repeat(1000), { fontSize: 10, font: handFont }).width).toBe(5000);
  });
});

describe('excalifont', () => {
  it('lists the code points each of its files serves, as the files do', () => {
    expect(excalifontFiles.files).toMatchObject(excalifont.files as object);
  });

  it('lists its seven files', () => {
    expect(excalifont.files).toHaveLength(7);
  });
});

describe('layoutText', () => {
  it.each<[TextAnchor, number]>([
    ['start', 100],
    ['middle', 88],
    ['end', 76],
  ])('puts the %s of the text at x', (anchor, x) => {
    expect(layoutText('AB', { ...at, anchor }).x).toBe(x);
  });

  it.each<[TextBaseline, number]>([
    ['alphabetic', 50],
    ['top', 66],
    ['middle', 56],
    ['bottom', 46],
  ])('puts the %s line of the text at y', (baseline, y) => {
    expect(layoutText('AB', { ...at, baseline }).y).toBe(y);
  });

  it('reports the box the text takes up, before rotation', () => {
    expect(layoutText('AB', { ...at, anchor: 'end', baseline: 'top' }).box).toEqual({
      x: 76,
      y: 50,
      width: 24,
      height: 20,
    });
  });

  it('rotates around the point it was laid out at, not where the text starts', () => {
    expect(layoutText('AB', { ...at, anchor: 'end', rotate: -45 })).toMatchObject({ x: 76, rotate: -45, pivot: [100, 50] });
  });

  it('starts the text at x, on the baseline at y, unrotated, by default', () => {
    expect(layoutText('AB', at)).toMatchObject({ x: 100, y: 50, rotate: 0, pivot: [100, 50] });
  });

  it('returns everything measureText returns', () => {
    expect(layoutText('A東', at)).toMatchObject(measureText('A東', { fontSize: 20, font: handFont }));
  });

  it('keeps the font size as given, unrounded', () => {
    expect(layoutText('A', { ...at, fontSize: 1.234 }).fontSize).toBe(1.234);
  });

  it('returns the family and size it laid the text out with', () => {
    expect(layoutText('AB', at)).toMatchObject({ family: 'Hand Test', fontSize: 20 });
  });

  it('rounds every position to two decimals, after placing the text', () => {
    expect(layoutText('A', { ...at, x: 0.004, fontSize: 1.234, anchor: 'middle' })).toMatchObject({
      x: -0.3,
      width: 0.62,
      pivot: [0, 50],
    });
  });

  it('never returns negative zero', () => {
    expect(Object.is(layoutText('', { ...at, x: -0.001 }).x, 0)).toBe(true);
  });
});
