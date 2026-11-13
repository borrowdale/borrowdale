// The geometry of an area-proportional Venn or Euler diagram of 2 or 3 circles: each circle's area is
// its set's size, and the circles are placed so that the area of each region (the points inside
// exactly the circles of some sets) is as near the size asked for as circles allow. Two circles can
// match any sizes exactly; three in general cannot, and the caller decides how far off is too far.
//
// Regions and sizes are indexed by a bit mask of their sets: bit i for set i, so index 3 is the
// overlap of sets 0 and 1. "Inclusive" sizes count everything in the overlap, as a spec gives them;
// "exclusive" sizes count only the region inside exactly those sets.
import { acos, atan2, cos, sin } from '@borrowdale/core/math';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

type Three<T> = [T, T, T];

/** Halvings of the distance between two circles, from tangent to nested. 2^-60 of a radius apart. */
const HALVINGS = 60;
/** The gap left between sets that do not overlap, as a share of the smaller radius. */
const APART = 0.1;
/**
 * Rounds of the search that places a third circle: a fixed count, so that the result does not hang
 * on a convergence test. The step halves on every round that finds no better move.
 */
const ROUNDS = 80;
/** The search's first step, as a share of the largest radius: a move to a neighbouring arrangement. */
const FIRST_STEP = 1 / 4;
/** How close, as a share of the largest radius, two points or edges count as one. */
const NEAR = 1e-10;
/**
 * An exclusive size this small, as a share of the largest size it comes from, is rounding and counts
 * as 0: 0.3 − 0.1 − 0.2 is −5.6e-17, not 0. Seven terms each within 2^-53 of the largest leave far
 * less than this.
 */
const ROUNDING = 1e-12;
/** Points across the bounds that a region's label spot is chosen from, 49 by 49. */
const GRID = 48;

const square = (x: number): number => x * x;
const radiusOf = (area: number): number => Math.sqrt(area / Math.PI);
const clamp = (x: number): number => Math.max(-1, Math.min(1, x));

/** The distance between two points, or the centres of two circles. */
function centreDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt(square(a.x - b.x) + square(a.y - b.y));
}

/** The box around every circle. */
export function circleBounds(circles: readonly Circle[]): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(...circles.map((c) => c.x - c.r)),
    top: Math.min(...circles.map((c) => c.y - c.r)),
    right: Math.max(...circles.map((c) => c.x + c.r)),
    bottom: Math.max(...circles.map((c) => c.y + c.r)),
  };
}

/**
 * The area two circles of radii `r1` and `r2` share when their centres are `d` apart: a lens, the
 * smaller circle when one is inside the other, or 0 when they are apart.
 */
export function lensArea(d: number, r1: number, r2: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * square(Math.min(r1, r2));
  const a1 = acos(clamp((square(d) + square(r1) - square(r2)) / (2 * d * r1)));
  const a2 = acos(clamp((square(d) + square(r2) - square(r1)) / (2 * d * r2)));
  const kite = Math.sqrt(Math.max(0, (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)));
  return square(r1) * a1 + square(r2) * a2 - kite / 2;
}

/**
 * How far apart to put the centres of circles of areas `a1` and `a2` so that they share `shared`:
 * apart with a gap when they share nothing, at the same centre when one holds the other, else found
 * by halving, since the lens shrinks as the circles move apart.
 */
export function distanceFor(a1: number, a2: number, shared: number): number {
  const [r1, r2] = [radiusOf(a1), radiusOf(a2)];
  if (shared <= 0) return r1 + r2 + APART * Math.min(r1, r2);
  if (shared >= Math.min(a1, a2)) return 0;
  let [near, far] = [Math.abs(r1 - r2), r1 + r2];
  for (let i = 0; i < HALVINGS; i++) {
    const middle = (near + far) / 2;
    if (lensArea(middle, r1, r2) > shared) near = middle;
    else far = middle;
  }
  return (near + far) / 2;
}

/**
 * The exclusive sizes of the regions of `count` sets, from their inclusive sizes, by mask. A size
 * within rounding of 0 is 0.
 */
export function exclusiveSizes(inclusive: readonly number[], count: number): number[] {
  const all = (1 << count) - 1;
  const largest = Math.max(...inclusive);
  return inclusive.map((_, mask) => {
    if (mask === 0) return 0;
    // Inclusion and exclusion: add the overlaps with an even number of further sets, take the odd.
    let total = 0;
    for (let more = all & ~mask; ; more = (more - 1) & all & ~mask) {
      total += (bits(more) % 2 === 0 ? 1 : -1) * inclusive[mask | more]!;
      if (more === 0) break;
    }
    return Math.abs(total) <= ROUNDING * largest ? 0 : total;
  });
}

function bits(mask: number): number {
  let count = 0;
  for (let m = mask; m > 0; m >>= 1) count += m & 1;
  return count;
}

/** The inclusive areas the circles draw, by mask: each circle, each pair's lens, and all three's. */
export function drawnInclusive(circles: readonly Circle[]): number[] {
  return Array.from({ length: 1 << circles.length }, (_, mask) => {
    const chosen = circles.filter((_, i) => (mask >> i) & 1);
    switch (chosen.length) {
      case 0:
        return 0;
      case 1:
        return Math.PI * square(chosen[0]!.r);
      case 2:
        return lensArea(centreDistance(chosen[0]!, chosen[1]!), chosen[0]!.r, chosen[1]!.r);
      default:
        return tripleArea(chosen);
    }
  });
}

/** How far each region the circles draw is from `wanted`, its exclusive size: drawn less wanted, by mask. */
export function regionErrors(circles: readonly Circle[], wanted: readonly number[]): number[] {
  return exclusiveSizes(drawnInclusive(circles), circles.length).map((area, mask) => area - wanted[mask]!);
}

interface Crossing {
  x: number;
  y: number;
  /** The circles whose edges pass through it. */
  on: number[];
}

/**
 * The area inside all of three circles: the polygon through the points where their edges cross
 * inside every circle, plus the circular segment beyond each side of it. With no such point, it is
 * the smallest circle when every other circle holds it, else nothing.
 */
function tripleArea(circles: readonly Circle[]): number {
  const near = NEAR * Math.max(...circles.map((c) => c.r));
  const inside = (p: { x: number; y: number }, c: Circle) => centreDistance(p, c) <= c.r + near;
  const crossings: Crossing[] = [];
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      for (const p of crossingPoints(circles[i]!, circles[j]!)) {
        if (!circles.every((c) => inside(p, c))) continue;
        // A circle that coincides with another crosses the third at the same points: one point, on
        // all three edges, not two.
        const seen = crossings.find((q) => centreDistance(p, q) <= near);
        if (seen) seen.on.push(...[i, j].filter((k) => !seen.on.includes(k)));
        else crossings.push({ ...p, on: [i, j] });
      }
    }
  }
  if (crossings.length < 2) {
    const smallest = [...circles].sort((a, b) => a.r - b.r)[0]!;
    const held = circles.every((c) => centreDistance(smallest, c) + smallest.r <= c.r + near);
    return held ? Math.PI * square(smallest.r) : 0;
  }
  const cx = crossings.reduce((sum, p) => sum + p.x, 0) / crossings.length;
  const cy = crossings.reduce((sum, p) => sum + p.y, 0) / crossings.length;
  const turn = (p: Crossing) => atan2(p.x - cx, p.y - cy);
  const ring = [...crossings].sort((a, b) => turn(b) - turn(a));
  let area = 0;
  ring.forEach((p1, k) => {
    const p2 = ring[(k + ring.length - 1) % ring.length]!;
    area += ((p2.x + p1.x) * (p1.y - p2.y)) / 2;
    area += segmentBetween(p1, p2, circles);
  });
  return area;
}

/** Where the edges of two circles cross: none, or two points (one, twice, where they touch). */
function crossingPoints(c1: Circle, c2: Circle): { x: number; y: number }[] {
  const d = centreDistance(c1, c2);
  if (d >= c1.r + c2.r || d <= Math.abs(c1.r - c2.r)) return [];
  const along = (square(c1.r) - square(c2.r) + square(d)) / (2 * d);
  const across = Math.sqrt(Math.max(0, square(c1.r) - square(along)));
  const [mx, my] = [c1.x + (along * (c2.x - c1.x)) / d, c1.y + (along * (c2.y - c1.y)) / d];
  const [ox, oy] = [(-(c2.y - c1.y) * across) / d, ((c2.x - c1.x) * across) / d];
  return [{ x: mx + ox, y: my + oy }, { x: mx - ox, y: my - oy }];
}

/**
 * The circular segment that bounds the shared area between two neighbouring crossings: of the circles
 * both lie on, the arc that bulges least, which is the one inside every other circle.
 */
function segmentBetween(p1: Crossing, p2: Crossing, circles: readonly Circle[]): number {
  let best: { r: number; height: number } | undefined;
  for (const index of p1.on.filter((k) => p2.on.includes(k))) {
    const c = circles[index]!;
    const a1 = atan2(p1.x - c.x, p1.y - c.y);
    const a2 = atan2(p2.x - c.x, p2.y - c.y);
    let sweep = a2 - a1;
    if (sweep < 0) sweep += 2 * Math.PI;
    const a = a2 - sweep / 2;
    const middle = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const height = Math.min(2 * c.r, centreDistance(middle, { x: c.x + c.r * sin(a), y: c.y + c.r * cos(a) }));
    if (!best || height < best.height) best = { r: c.r, height };
  }
  return best ? segmentArea(best.r, best.height) : 0;
}

/** The area of the segment of a circle of radius `r` cut off `height` deep. */
function segmentArea(r: number, height: number): number {
  return square(r) * acos(clamp(1 - height / r)) - (r - height) * Math.sqrt(Math.max(0, height * (2 * r - height)));
}

/**
 * Circles for 2 or 3 sets of the inclusive sizes `inclusive`, by mask. The first set's circle is at
 * the origin and the second's on the positive x-axis. Two circles are exact. A third starts where its
 * distances to the other two are as asked, then a fixed number of rounds move the second and third
 * circles a step at a time, wherever that brings the exclusive areas nearer, so the result is the
 * same for the same sizes everywhere.
 */
export function placeCircles(inclusive: readonly number[], count: 2 | 3): Circle[] {
  const d01 = distanceFor(inclusive[1]!, inclusive[2]!, inclusive[3]!);
  if (count === 2) return [{ x: 0, y: 0, r: radiusOf(inclusive[1]!) }, { x: d01, y: 0, r: radiusOf(inclusive[2]!) }];
  const radii: Three<number> = [radiusOf(inclusive[1]!), radiusOf(inclusive[2]!), radiusOf(inclusive[4]!)];
  const d02 = distanceFor(inclusive[1]!, inclusive[4]!, inclusive[5]!);
  const d12 = distanceFor(inclusive[2]!, inclusive[4]!, inclusive[6]!);
  // Where the third circle is d02 from the first and d12 from the second, or as near as can be.
  const x = d01 === 0 ? d02 : (square(d02) - square(d12) + square(d01)) / (2 * d01);
  const circlesAt = ([bx, cx, cy]: Three<number>): Circle[] => [
    { x: 0, y: 0, r: radii[0] },
    { x: bx, y: 0, r: radii[1] },
    { x: cx, y: cy, r: radii[2] },
  ];
  const wanted = exclusiveSizes(inclusive, 3);
  const loss = (place: Three<number>) => regionErrors(circlesAt(place), wanted).reduce((sum, error) => sum + square(error), 0);
  let place: Three<number> = [d01, x, Math.sqrt(Math.max(0, square(d02) - square(x)))];
  let best = loss(place);
  let step = FIRST_STEP * Math.max(...radii);
  for (let round = 0; round < ROUNDS; round++) {
    let moved = false;
    for (const k of [0, 1, 2] as const) {
      for (const sign of [1, -1]) {
        const trial: Three<number> = [...place];
        trial[k] += sign * step;
        const trialLoss = loss(trial);
        if (trialLoss < best) [place, best, moved] = [trial, trialLoss, true];
      }
    }
    if (!moved) step /= 2;
  }
  return circlesAt(place);
}

/**
 * For each region, a point inside it as far from every edge as a grid over the circles' bounds finds,
 * by mask. A region too thin for the grid to reach has none.
 */
export function regionSpots(circles: readonly Circle[]): Map<number, { x: number; y: number }> {
  const { left, top, right, bottom } = circleBounds(circles);
  const best = new Map<number, { x: number; y: number; room: number }>();
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const point = { x: left + ((right - left) * i) / GRID, y: top + ((bottom - top) * j) / GRID };
      const gaps = circles.map((c) => c.r - centreDistance(point, c));
      const mask = gaps.reduce((bitsIn, gap, k) => (gap > 0 ? bitsIn | (1 << k) : bitsIn), 0);
      const room = Math.min(...gaps.map((gap) => Math.abs(gap)));
      const seen = best.get(mask);
      if (mask !== 0 && (!seen || room > seen.room)) best.set(mask, { ...point, room });
    }
  }
  return new Map([...best].map(([mask, { x, y }]) => [mask, { x, y }]));
}
