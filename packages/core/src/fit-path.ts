import { drawWithin, type Budget } from './budget.js';
import { normalizedPath, pointsOnPath } from './engine/path-data.js';

/** A box to fit a path into: its top-left corner and its size. */
export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The path data `d` scaled, keeping its proportions, and moved to sit centred in `box`, written as
 * absolute moves, lines and curves, with the box it then fills. Its extent is taken from points along
 * it, so a curve's control points do not widen it. Parsing is charged to `budget`. Throws as `sketch`
 * does for path data it cannot draw, and for a path with no width or no height.
 */
export function fitPath(d: string, box: FitBox, budget: Budget): { d: string; box: FitBox } {
  return drawWithin(budget, () => {
    const segments = normalizedPath(d);
    // One pass, not a spread: a long path has more points than an engine takes as arguments.
    let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of pointsOnPath(segments).flat()) {
      [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
    }
    if (!(right > left && bottom > top)) {
      throw new Error('Invalid shape: path.d needs a width and a height to fit a box');
    }
    const scale = Math.min(box.width / (right - left), box.height / (bottom - top));
    const dx = box.x + (box.width - (right - left) * scale) / 2 - left * scale;
    const dy = box.y + (box.height - (bottom - top) * scale) / 2 - top * scale;
    const at = (value: number, i: number) => String(Math.round((i % 2 === 0 ? value * scale + dx : value * scale + dy) * 100) / 100);
    return {
      d: segments.map(({ key, data }) => [key, ...data.map(at)].join(' ')).join(' '),
      box: { x: left * scale + dx, y: top * scale + dy, width: (right - left) * scale, height: (bottom - top) * scale },
    };
  });
}
