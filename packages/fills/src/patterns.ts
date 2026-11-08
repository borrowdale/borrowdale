import {
  assertDrawable,
  sketch,
  stableKey,
  svgElement,
  toSeed,
  toSvgPaths,
  type Seed,
  type Shape,
  type SketchStyle,
} from '@borrowdale/core';
import { COLOR_RULE, isColor, MAX_PAINT, show } from '@borrowdale/core/internal';

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
const MAX_ID = MAX_PAINT - 'url(#)'.length;

export function pattern(options: PatternOptions): Pattern {
  const { kind, size = 10, background, id, seed, ...style } = options;
  // Every option is checked before it is keyed, so a misspelled or malformed one gets its own error
  // rather than whatever deriving the key from it would throw.

  // SVG silently skips a pattern tile of zero or negative size.
  if (!(Number.isFinite(size) && size > 0)) {
    throw new Error(`Invalid pattern size: ${show(size)}`);
  }
  const shapes = tileShapes(kind, size);
  // Validated rather than escaped: the id must also be safe inside CSS url(#…), and short enough
  // that the `fill` naming it is a paint the other packages accept.
  if (id !== undefined && (typeof id !== 'string' || id.length > MAX_ID || !VALID_ID.test(id))) {
    throw new Error(`Invalid pattern id: ${show(id)}`);
  }
  // A colour, not any CSS paint: a `url(…)` to another file or a `var(…)` would have the page fetch
  // the file or paint with its own values.
  if (background !== undefined && !isColor(background)) {
    throw new Error(
      `Invalid pattern background: must be ${COLOR_RULE}, at most ${MAX_PAINT} characters, got ${show(background)}`,
    );
  }
  if (seed !== undefined && typeof seed !== 'string' && !Number.isFinite(seed)) {
    throw new Error(`Invalid pattern seed: must be a string or a finite number, got ${show(seed)}`);
  }
  // The style, checked as each tile's strokes are drawn with it.
  for (const shape of shapes) {
    assertDrawable(shape, style);
  }

  // One key for both the strokes and the id, derived from every option rather than just the seed,
  // so tiles with different options almost always get different ids. Two <pattern>s sharing an id
  // make `url(#id)` resolve to only one of them, so ids from users' options should be set explicitly.
  const optionsKey = stableKey({ kind, size, background, id, seed, ...style });
  const seedKey = String(seed ?? optionsKey);
  const patternId = id ?? `borrowdale-${kind}-${toSeed(optionsKey)}`;

  const backdrop =
    background === undefined
      ? ''
      : svgElement('rect', { width: size, height: size, fill: background });
  const strokes = shapes
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
  throw new Error(`Unknown pattern kind: ${show(kind)}`);
}
