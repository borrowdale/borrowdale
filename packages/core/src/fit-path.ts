import { drawWithin, type Budget } from './budget.js';
import { normalizedPath, type Segment } from './engine/path-data.js';

/** A box to fit a path into: its top-left corner and its size. */
export interface FitBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The path data `d` scaled, keeping its proportions, and moved to sit centred in `box`, written as
 * absolute moves, lines and curves, with the box it then fills. Its extent is the curve's own, so a
 * curve's control points do not widen it. Parsing is charged to `budget`. Throws as `sketch` does for
 * path data it cannot draw, and for a path with no width or no height.
 */
export function fitPath(d: string, box: FitBox, budget: Budget): { d: string; box: FitBox } {
  return drawWithin(budget, () => {
    const segments = normalizedPath(d);
    const [left, right, top, bottom] = extentOf(segments);
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

/**
 * The smallest box holding the path: the ends of its segments, and the points where a curve turns
 * back along either axis. Exact, so it does not depend on the units the path is written in.
 */
function extentOf(segments: readonly Segment[]): [number, number, number, number] {
  // One pass, not a spread: a long path has more points than an engine takes as arguments.
  let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
  const add = (x: number, y: number) => {
    [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
  };
  let [x0, y0, startX, startY] = [0, 0, 0, 0];
  for (const { key, data } of segments) {
    if (key === 'Z') {
      [x0, y0] = [startX, startY];
      continue;
    }
    const [x, y] = [data[data.length - 2]!, data[data.length - 1]!];
    if (key === 'C') {
      const [x1, y1, x2, y2] = [data[0]!, data[1]!, data[2]!, data[3]!];
      for (const t of [...turns(x0, x1, x2, x), ...turns(y0, y1, y2, y)]) {
        add(cubic(x0, x1, x2, x, t), cubic(y0, y1, y2, y, t));
      }
    }
    if (key === 'M') [startX, startY] = [x, y];
    add(x, y);
    [x0, y0] = [x, y];
  }
  return [left, right, top, bottom];
}

/** Where, strictly between its ends, a cubic Bézier in one axis has slope 0. */
function turns(p0: number, p1: number, p2: number, p3: number): number[] {
  // The slope, divided by 3, is a t² + b t + c; solved in the form that keeps its precision when a
  // is near 0.
  const [a, b, c] = [p3 - p0 + 3 * (p1 - p2), 2 * (p0 - 2 * p1 + p2), p1 - p0];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const q = -(b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant)) / 2;
  const roots = q === 0 ? [] : a === 0 ? [c / q] : [q / a, c / q];
  return roots.filter((t) => t > 0 && t < 1);
}

/** A cubic Bézier in one axis at `t`. */
function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const s = 1 - t;
  return s * s * s * p0 + 3 * s * s * t * p1 + 3 * s * t * t * p2 + t * t * t * p3;
}
