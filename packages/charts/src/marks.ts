// Marks every coordinate system draws alike.
import type { Point, Shape, SketchStyle } from '@borrowdale/core';
import type { ColorScale } from './color-scale.js';
import type { Drawing, SeedKey } from './drawing.js';
import { GRID } from './palette.js';
import type { ChartNode } from './types.js';

/** The diameter of a scatter point. */
export const POINT_SIZE = 6;
/** The diameter of a lone point of a line, which a line cannot show. */
const LONE_DOT = POINT_SIZE * 0.7;

/** Filled and outlined in one colour. */
export function solid(color: string): { stroke: string; fill: string; fillStyle: 'solid' } {
  return { stroke: color, fill: color, fillStyle: 'solid' };
}

/** A line's lone point, a run of one between gaps, as a dot in the line's colour. */
export function loneDot(drawing: Drawing, [cx, cy]: Point, stroke: string, key: SeedKey, own: SketchStyle): ChartNode {
  return drawing.shape({ kind: 'circle', cx, cy, diameter: LONE_DOT }, solid(stroke), key, own);
}

/** The values between nulls, each run in order. Interior cuts repeat their vertex in both runs. */
export function runsOf<T>(entries: readonly (T | null)[], cuts?: ReadonlySet<number>): T[][] {
  const runs: T[][] = [];
  let current: T[] = [];
  for (const [index, entry] of entries.entries()) {
    if (entry === null) {
      if (current.length > 0) {
        runs.push(current);
      }
      current = [];
    } else {
      current.push(entry);
      if (cuts?.has(index) && current.length > 1 && index + 1 < entries.length && entries[index + 1] !== null) {
        runs.push(current);
        current = [entry];
      }
    }
  }
  return current.length > 0 ? [...runs, current] : runs;
}

/**
 * The runs between nulls, each cut at `cuts` as `runsOf` cuts them, and numbered by the run it was
 * cut from and its place in that run. So a cut in one run never renumbers the pieces of another.
 */
export function piecesOf<T>(
  entries: readonly (T | null)[],
  cuts: ReadonlySet<number> | undefined,
): { points: T[]; run: number; piece: number }[] {
  const indexed = entries.map((entry, index) => (entry === null ? null : { entry, index }));
  return runsOf(indexed).flatMap((run, r) => {
    const at = new Set(run.flatMap(({ index }, k) => (cuts?.has(index) ? [k] : [])));
    return runsOf(run, at).map((piece, p) => ({ points: piece.map(({ entry }) => entry), run: r, piece: p }));
  });
}

/** What a cell with no value is called, in its tooltip and in the legend. */
export const NO_VALUE = 'no value';
/** How a cell with no value is drawn: an outline only, never in the colour of the lowest value. */
export const EMPTY_CELL: SketchStyle = { stroke: GRID, strokeWidth: 1 };

/** A cell coloured by its value through the colour axis, or with no value an outline only. */
export function valueCell(drawing: Drawing, shape: Shape, value: number | null, color: ColorScale, key: SeedKey, own: SketchStyle): ChartNode {
  return value === null ? drawing.outline(shape, EMPTY_CELL, key, own) : drawing.shape(shape, solid(color.color(value)), key, own);
}

/** A value cell's tooltip: its series, its place and its value, or that it has none. */
export function valueTitle(name: string, place: string, value: number | null, color: ColorScale): string {
  return `${name}, ${place}: ${value === null ? NO_VALUE : color.format(value)}`;
}
