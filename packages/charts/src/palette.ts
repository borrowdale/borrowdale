import type { SketchStyle } from '@borrowdale/core';
import { fail } from './read.js';

// The Okabe–Ito colours, which stay distinct with the common forms of colour blindness (black left
// out: it is the colour of the axes), with yellow last because it is faint on white. Once all seven
// are used they come round again with the next hachure angle, so no two entries look the same.
const COLORS = ['#e69f00', '#56b4e9', '#009e73', '#0072b2', '#d55e00', '#cc79a7', '#f0e442'];
const ANGLES = [-41, 49, -11, 79];

/** The colour of axes, ticks and text. */
export const INK = '#333';
/** The colour of gridlines. */
export const GRID = '#c8c8c8';
/** The stroke width of lines, area edges and radar outlines. */
export const LINE_WIDTH = 2;
/** The stroke width of gridlines and spokes. */
export const GRID_WIDTH = 0.5;

export interface Paint {
  color: string;
  hachureAngle: number;
}

/**
 * A colour and hachure angle for each entry, in order: its own colour when it has one, else the next
 * pair of the palette. Throws rather than hand out a palette pair twice, which would make two entries
 * look the same; an entry's own colour is the caller's choice and is not checked against the others.
 */
export function paints(entries: readonly { color: string | undefined; path: string }[]): Paint[] {
  let next = 0;
  return entries.map(({ color, path }) => {
    if (color !== undefined) {
      return { color, hachureAngle: ANGLES[0]! };
    }
    if (next >= COLORS.length * ANGLES.length) {
      const pairs = COLORS.length * ANGLES.length;
      fail(path, `needs a color: the ${pairs} colour and hatching pairs of the palette are used up`);
    }
    const paint = { color: COLORS[next % COLORS.length]!, hachureAngle: ANGLES[Math.floor(next / COLORS.length)]! };
    next++;
    return paint;
  });
}

/** A shape filled with hachure lines and outlined in the paint's colour. */
export function hatched({ color, hachureAngle }: Paint): SketchStyle {
  return { stroke: color, fill: color, fillStyle: 'hachure', hachureAngle };
}
