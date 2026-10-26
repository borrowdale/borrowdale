import {
  sketch,
  stableKey,
  svgElement,
  toSeed,
  toSvgPaths,
  type Seed,
  type Shape,
  type SketchStyle,
} from '@borrowdale/core';

export type PatternKind = 'lines' | 'crosshatch' | 'circles';

export interface PatternOptions extends SketchStyle {
  kind: PatternKind;
  /** Tile size in user units. Defaults to 10. */
  size?: number | undefined;
  /** Colour painted behind the strokes. Transparent when omitted. */
  background?: string | undefined;
  /** Element id for the `<pattern>`. Derived from the options when omitted. */
  id?: string | undefined;
  seed?: Seed | undefined;
}

export interface Pattern {
  id: string;
  /** A `<pattern>` element, to be placed inside `<defs>`. */
  def: string;
  /** Value for a `fill` attribute that references the pattern. */
  fill: string;
}

const VALID_ID = /^[A-Za-z][\w-]*$/;

export function pattern(options: PatternOptions): Pattern {
  const { kind, size = 10, background, id, seed, ...style } = options;
  // One key for both the strokes and the id, derived from every option rather than just the
  // seed, so different tiles get different ids (barring a hash collision). Two <pattern>s
  // sharing an id make `url(#id)` silently resolve to whichever comes first in the document.
  const optionsKey = stableKey({ ...options, size });
  const seedKey = String(seed ?? optionsKey);
  const patternId = id ?? `borrowdale-${kind}-${toSeed(optionsKey)}`;
  // Validated rather than escaped: the id must also be safe inside CSS url(#…).
  if (!VALID_ID.test(patternId)) {
    throw new Error(`Invalid pattern id: ${patternId}`);
  }
  // SVG silently skips a pattern tile of zero or negative size.
  if (!(Number.isFinite(size) && size > 0)) {
    throw new Error(`Invalid pattern size: ${String(size)}`);
  }

  const backdrop =
    background === undefined
      ? ''
      : svgElement('rect', { width: size, height: size, fill: background });
  const strokes = tileShapes(kind, size)
    .map((shape, index) => toSvgPaths(sketch(shape, { ...style, seed: `${seedKey}:${index}` })))
    .join('');

  return {
    id: patternId,
    def: svgElement(
      'pattern',
      { id: patternId, patternUnits: 'userSpaceOnUse', width: size, height: size },
      `${backdrop}${strokes}`,
    ),
    fill: `url(#${patternId})`,
  };
}

// Diagonals continue past the tile corners so neighbouring tiles join up (after textures.js).
function tileShapes(kind: PatternKind, s: number): Shape[] {
  switch (kind) {
    case 'lines':
      return risingDiagonals(s);
    case 'crosshatch':
      return [...risingDiagonals(s), ...fallingDiagonals(s)];
    case 'circles':
      return [{ kind: 'circle', cx: s / 2, cy: s / 2, diameter: s / 2 }];
    default:
      return unknownKind(kind);
  }
}

function risingDiagonals(s: number): Shape[] {
  return [
    { kind: 'line', x1: 0, y1: s, x2: s, y2: 0 },
    { kind: 'line', x1: -s / 4, y1: s / 4, x2: s / 4, y2: -s / 4 },
    { kind: 'line', x1: (3 * s) / 4, y1: (5 * s) / 4, x2: (5 * s) / 4, y2: (3 * s) / 4 },
  ];
}

function fallingDiagonals(s: number): Shape[] {
  return [
    { kind: 'line', x1: 0, y1: 0, x2: s, y2: s },
    { kind: 'line', x1: -s / 4, y1: (3 * s) / 4, x2: s / 4, y2: (5 * s) / 4 },
    { kind: 'line', x1: (3 * s) / 4, y1: -s / 4, x2: (5 * s) / 4, y2: s / 4 },
  ];
}

function unknownKind(kind: never): never {
  throw new Error(`Unknown pattern kind: ${String(kind)}`);
}
