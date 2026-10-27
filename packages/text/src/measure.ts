import type { LayoutOptions, MeasureOptions, TextAnchor, TextBaseline, TextExtent, TextLayout } from './types.js';
import { advanceOf, checkLayout, checkMeasure, codePointOf, type CheckedMeasure } from './validate.js';

// Characters browsers draw as nothing (soft hyphens, zero-width joiners, variation selectors), so
// measured as nothing: Unicode's default-ignorable set, less the seven Chromium draws with a width
// from a fallback font (measured over all 4,174 of them): U+180F, U+3164, U+FFA0, U+1BCA0-1BCA3.
// Those count as uncovered. The whole set, without the exceptions, measures them wrongly as nothing.
const IGNORABLE = /(?![\u180F\u3164\uFFA0\u{1BCA0}-\u{1BCA3}])\p{Default_Ignorable_Code_Point}/u;

// How far left of `x` the text starts, as a share of its width.
const ANCHOR_SHARE: Record<TextAnchor, number> = { start: 0, middle: 0.5, end: 1 };

// How far below `y` the baseline sits.
const BASELINE_SHIFT: Record<TextBaseline, (ascent: number, descent: number) => number> = {
  alphabetic: () => 0,
  top: (ascent) => ascent,
  middle: (ascent, descent) => (ascent - descent) / 2,
  bottom: (_ascent, descent) => -descent,
};

/**
 * Measures text from the font's own advance widths, with no DOM. Kerning and ligatures are not
 * applied, and the renderers switch them off, so the drawn text is exactly this wide.
 */
export function measureText(text: string, options?: MeasureOptions): TextExtent {
  return rounded(extent(checkMeasure(text, options)));
}

/** Measures text and places it, so the renderers only draw and never measure. */
export function layoutText(text: string, options: LayoutOptions): TextLayout {
  const checked = checkLayout(text, options);
  const { x, y, rotate } = checked;
  const measured = extent(checked);
  const startX = x - measured.width * ANCHOR_SHARE[checked.anchor];
  const baselineY = y + BASELINE_SHIFT[checked.baseline](measured.ascent, measured.descent);
  return {
    ...rounded(measured),
    family: checked.font.family,
    fontSize: checked.fontSize,
    x: round(startX),
    y: round(baselineY),
    box: {
      x: round(startX),
      y: round(baselineY - measured.ascent),
      width: round(measured.width),
      height: round(measured.ascent + measured.descent),
    },
    rotate,
    pivot: [round(x), round(y)],
  };
}

// Unrounded, so each value is rounded once, after the arithmetic.
function extent({ text, font, fontSize }: CheckedMeasure): TextExtent {
  const missing = new Set<string>();
  let units = 0;
  for (const character of text) {
    if (IGNORABLE.test(character)) {
      continue;
    }
    const advance = advanceOf(font, codePointOf(character));
    if (advance === undefined) {
      missing.add(character);
    }
    units += advance ?? font.unitsPerEm;
  }
  const scale = fontSize / font.unitsPerEm;
  return {
    text,
    width: units * scale,
    ascent: font.ascender * scale,
    descent: -font.descender * scale,
    missing: [...missing],
  };
}

function rounded({ width, ascent, descent, ...rest }: TextExtent): TextExtent {
  return { ...rest, width: round(width), ascent: round(ascent), descent: round(descent) };
}

// Two decimals, as the stroke engine rounds its coordinates; `+ 0` turns -0 into 0.
function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
