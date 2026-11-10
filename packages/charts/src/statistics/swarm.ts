import type { Point } from '@borrowdale/core';
import type { Rect } from '../frame.js';
import { POINT_SIZE } from '../marks.js';
import { fail } from '../read.js';
import type { Glyph } from './geometry.js';

/**
 * The offset nearest the group position at which a circle clears the circles already placed, in
 * screen coordinates. Each neighbour excludes an interval of offsets along the group axis; the
 * nearest free one gives a compact swarm. `min` and `max` bound the offset, and a one-sided swarm
 * keeps them both on one side of zero.
 */
export function swarmOffset(
  value: number,
  radius: number,
  placed: readonly Circle[],
  min: number,
  max: number,
  circular = true,
): number | undefined {
  const blocked: [number, number][] = [];
  for (const circle of placed) {
    const delta = value - circle.value;
    const gap = circle.radius + radius + 1;
    if (Math.abs(delta) >= gap) continue;
    const side = circular ? Math.sqrt(gap * gap - delta * delta) : gap;
    blocked.push([circle.offset - side, circle.offset + side]);
  }
  blocked.sort((a, b) => a[0] - b[0]);
  let low = min;
  let best: number | undefined;
  const consider = (left: number, right: number) => {
    if (left > right) return;
    const candidate = Math.min(right, Math.max(left, 0));
    if (best === undefined || Math.abs(candidate) < Math.abs(best)) best = candidate;
  };
  for (const [left, right] of blocked) {
    consider(low, Math.min(max, left));
    low = Math.max(low, right);
  }
  consider(low, max);
  return best;
}

/**
 * Moves each swarm marker's screen point aside from its group position until it clears the markers
 * already placed, in order. Markers spread across the group axis: x for a vertical swarm, y for a
 * horizontal one (whose values are on x).
 */
export function placeSwarm(path: string, marks: readonly Glyph[], screen: Point[][], plot: Rect, mirrored: boolean): void {
  const circles: Circle[] = [];
  marks.forEach((mark, i) => {
    const points = screen[i]!;
    const along = mark.along === 'x' ? 1 : 0;
    const value = points[0]![1 - along]!;
    const origin = points[0]![along]!;
    const radius = (mark.size ?? POINT_SIZE) / 2;
    const low = (along ? plot.top : plot.left) - origin + radius;
    const high = (along ? plot.bottom : plot.right) - origin - radius;
    // A one-sided swarm grows as a dot plot stacks: rightward, or up the screen when horizontal.
    const min = mirrored || along ? low : Math.max(low, 0);
    const max = mirrored || !along ? high : Math.min(high, 0);
    const offset = swarmOffset(value, radius, circles, min, max, mark.symbol === 'circle');
    if (offset === undefined) fail(path, 'needs more room for its swarm markers');
    circles.push({ value, radius, offset });
    points[0] = along ? [value, origin + offset] : [origin + offset, value];
  });
}

export interface Circle {
  value: number;
  radius: number;
  offset: number;
}
