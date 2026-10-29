import { cos, sin } from '@borrowdale/core/math';
import type { Box, LayoutOptions, MeasureOptions, TextAnchor, TextBaseline, TextExtent, TextLayout } from './types.js';
import {
  advanceOf,
  checkLayout,
  checkMeasure,
  codePointOf,
  IGNORABLE,
  type CheckedFont,
  type CheckedMeasure,
} from './validate.js';

// A character and the combining marks after it, with any zero-width joiner among or after them:
// Unicode keeps a joiner with the character before it. Measured in Chromium: the browser draws such
// a cluster from one font file, or all of it in a fallback font. Marks with no character before
// them make a cluster of their own.
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

/**
 * The upright box that holds a layout once it is rotated: its `box` turned by `rotate` degrees
 * around its `pivot`. Equal to `box` when the text is not rotated.
 */
export function textBounds({ box, rotate, pivot: [px, py] }: TextLayout): Box {
  const radians = (rotate * Math.PI) / 180;
  const [c, s] = [cos(radians), sin(radians)];
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([cx, cy]) => [px + (cx! - px) * c - (cy! - py) * s, py + (cx! - px) * s + (cy! - py) * c] as const);
  const xs = corners.map(([cx]) => cx);
  const ys = corners.map(([, cy]) => cy);
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  return { x: round(left), y: round(top), width: round(Math.max(...xs) - left), height: round(Math.max(...ys) - top) };
}

// Unrounded, so each value is rounded once, after the arithmetic.
function extent({ text, font, fontSize }: CheckedMeasure): TextExtent {
  const missing = new Set<string>();
  let units = 0;
  for (const [cluster] of text.matchAll(CLUSTER)) {
    const codePoints: number[] = [];
    let covered = true;
    for (const character of cluster) {
      if (IGNORABLE.test(character)) {
        continue;
      }
      const codePoint = codePointOf(character);
      const advance = advanceOf(font, codePoint);
      codePoints.push(codePoint);
      covered &&= advance !== undefined;
      units += advance ?? font.unitsPerEm;
    }
    if (!covered || !oneFileServes(font, codePoints)) {
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

// Whether one of the font's files serves every one of the code points. Measured in Chromium: the
// browser draws a cluster from any one file that serves all of it, whatever the order of the files.
function oneFileServes(font: CheckedFont, codePoints: readonly number[]): boolean {
  return font.files.some(({ ranges }) =>
    codePoints.every((codePoint) => ranges.some(([first, last]) => codePoint >= first && codePoint <= last)),
  );
}

function rounded({ width, ascent, descent, ...rest }: TextExtent): TextExtent {
  return { ...rest, width: round(width), ascent: round(ascent), descent: round(descent) };
}

// Two decimals, as the stroke engine rounds its coordinates; `+ 0` turns -0 into 0.
function round(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
