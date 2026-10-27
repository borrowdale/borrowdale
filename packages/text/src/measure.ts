import type { LayoutOptions, MeasureOptions, TextAnchor, TextBaseline, TextExtent, TextLayout } from './types.js';
import {
  advanceOf,
  checkLayout,
  checkMeasure,
  codePointOf,
  IGNORABLE,
  type CheckedFont,
  type CheckedMeasure,
} from './validate.js';

// A character and the combining marks after it, with any zero-width joiner among them. Measured in
// Chromium: the browser draws such a cluster from one font file, or all of it in a fallback font.
// Marks with no character before them make a cluster of their own.
const CLUSTER = /[^\p{M}\u200D][\p{M}\u200D]*|[\p{M}\u200D]+/gu;

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
  for (const [cluster] of text.matchAll(CLUSTER)) {
    // The files serving the cluster's characters, with undefined for one the font cannot draw.
    const files = new Set<number | undefined>();
    for (const character of cluster) {
      if (IGNORABLE.test(character)) {
        continue;
      }
      const codePoint = codePointOf(character);
      const advance = advanceOf(font, codePoint);
      files.add(advance === undefined ? undefined : fileOf(font, codePoint));
      units += advance ?? font.unitsPerEm;
    }
    if (files.has(undefined) || files.size > 1) {
      missing.add(cluster);
    }
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

// The index of the font file that serves a code point, or undefined when none does.
function fileOf(font: CheckedFont, codePoint: number): number | undefined {
  const index = font.files.findIndex(({ ranges }) =>
    ranges.some(([first, last]) => codePoint >= first && codePoint <= last),
  );
  return index === -1 ? undefined : index;
}

function rounded({ width, ascent, descent, ...rest }: TextExtent): TextExtent {
  return { ...rest, width: round(width), ascent: round(ascent), descent: round(descent) };
}

// Two decimals, as the stroke engine rounds its coordinates; `+ 0` turns -0 into 0.
function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
