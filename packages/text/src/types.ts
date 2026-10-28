import type { Point } from '@borrowdale/core';

/**
 * What measuring needs to know about a font, in font units. Measurement and rendering both read the
 * family from here, so a label is always drawn in the font it was measured with.
 */
export interface Font {
  /** The CSS font family the metrics belong to. */
  family: string;
  unitsPerEm: number;
  /** Height above the baseline. */
  ascender: number;
  /** Depth below the baseline, as a negative number. */
  descender: number;
  /** Advance width of every code point the font covers. */
  advances: Readonly<Record<number, number>>;
  /**
   * For a font split into files by Unicode range, the code points each file serves: its `FontFiles`
   * files without their bytes. A browser draws a character and the combining marks after it from
   * one file, so measuring needs to know when no one file serves them all. Leave it out for a font
   * in one file. Read only as the font's own property: a font that inherits it counts as one file.
   */
  files?: readonly Pick<FontFile, 'ranges'>[] | undefined;
}

/** A font's woff2 files, for embedding in a document or loading into a page. */
export interface FontFiles {
  family: string;
  files: readonly FontFile[];
}

export interface FontFile {
  /** The code points this file serves, as inclusive `[first, last]` ranges. */
  ranges: readonly (readonly [first: number, last: number])[];
  /** The woff2 file, base64-encoded. */
  woff2: string;
}

export const TEXT_ANCHORS = ['start', 'middle', 'end'] as const;

export type TextAnchor = (typeof TEXT_ANCHORS)[number];

export const TEXT_BASELINES = ['alphabetic', 'top', 'middle', 'bottom'] as const;

export type TextBaseline = (typeof TEXT_BASELINES)[number];

export interface MeasureOptions {
  /** In user units. Defaults to 16. */
  fontSize?: number | undefined;
  /** Defaults to Excalifont. */
  font?: Font | undefined;
}

export interface LayoutOptions extends MeasureOptions {
  x: number;
  y: number;
  /** Which part of the text sits at `x`. Defaults to `start`. */
  anchor?: TextAnchor | undefined;
  /** Which line of the text sits at `y`. Defaults to `alphabetic`, the baseline. */
  baseline?: TextBaseline | undefined;
  /** Clockwise rotation in degrees around (`x`, `y`). Defaults to 0. */
  rotate?: number | undefined;
}

export interface TextExtent {
  /**
   * The text as it is drawn: accents composed (Unicode NFC), runs of spaces and tabs collapsed to
   * one space, and trimmed.
   */
  text: string;
  width: number;
  /** Height above the baseline. */
  ascent: number;
  /** Depth below the baseline, as a positive number. */
  descent: number;
  /**
   * What the browser draws in a fallback font, each once: a character with the combining marks
   * after it, and any zero-width joiner, when the font does not cover one of them or no one file of
   * the font serves all of them. A character the font does not cover was measured as 1 em wide;
   * the others at the font's own widths.
   */
  missing: string[];
}

export interface TextLayout extends TextExtent {
  /** The family of the font the text was measured with, which the renderers draw it in. */
  family: string;
  fontSize: number;
  /** Where the baseline starts. */
  x: number;
  y: number;
  /** The space the text takes up, before rotation. */
  box: { x: number; y: number; width: number; height: number };
  rotate: number;
  /** The point the text rotates around: the `x` and `y` it was laid out at. */
  pivot: Point;
}

export interface TextStyle {
  /** Defaults to `#000`. */
  fill?: string | undefined;
}
