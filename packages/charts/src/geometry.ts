// Geometry shared by the round charts: points on a circle, fitting part of a circle into a box, and
// slices of a ring, all through the stroke engine's portable sine and cosine.
import type { Point, Shape } from '@borrowdale/core';
import { cos, sin } from '@borrowdale/core/math';
import type { TextAnchor, TextBaseline } from '@borrowdale/text';
import { TURN_ROUNDING } from './check-axis.js';
import { coordinate } from './curves.js';
import type { Rect } from './frame.js';
import type { PlacedScale, Scale } from './scale.js';

/** Degrees to radians. */
export const RADIANS = Math.PI / 180;
// Beyond this share of a unit vector's length off an axis, a label is placed to that side.
const SIDE = 0.01;
/** The share of the rim's length that ticks around it are spaced along. */
export const RIM_SHARE = 0.5;

/** The point `degrees` clockwise from the top of a circle of radius 1 around the origin. */
export function onCircle(degrees: number): Point {
  const radians = degrees * RADIANS;
  return [sin(radians), -cos(radians)];
}

/** Whether the sweep from `from` to `to` degrees is a whole turn, give or take rounding. */
export function isWholeTurn(from: number, to: number): boolean {
  return to - from >= 360 - TURN_ROUNDING;
}

/**
 * How to anchor a label placed at `degrees` around a centre so it stays clear of the circle: away
 * from the centre for a label outside the rim, towards it for one inside.
 */
export function alignTowards(degrees: number, outward: boolean): { anchor: TextAnchor; baseline: TextBaseline } {
  const [dx, dy] = onCircle(degrees);
  const [ahead, behind]: [TextAnchor, TextAnchor] = outward ? ['start', 'end'] : ['end', 'start'];
  const [below, above]: [TextBaseline, TextBaseline] = outward ? ['bottom', 'top'] : ['top', 'bottom'];
  return {
    anchor: dx > SIDE ? ahead : dx < -SIDE ? behind : 'middle',
    baseline: dy < -SIDE ? below : dy > SIDE ? above : 'middle',
  };
}

/** A polar chart's place: its centre and radius, and the points around it. */
export interface PolarFrame {
  center: Point;
  radius: number;
  /** The radius of the hole in the middle. */
  hole: number;
  /** The point `distance` from the centre, `degrees` clockwise from the top. */
  point: (degrees: number, distance: number) => Point;
}

/** A polar frame around `[cx, cy]`, `radius` out to the rim, with a hole of radius `hole`. */
export function polarFrame([cx, cy]: Point, radius: number, hole: number): PolarFrame {
  return {
    center: [cx, cy],
    radius,
    hole,
    point: (degrees, distance) => {
      const [dx, dy] = onCircle(degrees);
      return [cx + distance * dx, cy + distance * dy];
    },
  };
}

/**
 * The centre and radius of the largest part of a circle from `startAngle` to `endAngle` that fits in
 * `rect`, with a hole of `innerRadius` times the radius: its extent is that of its ends, the quarter
 * turns between them, and the centre or the ends of the hole. `padding` widens that extent, taken on
 * a circle of radius 1, by as much on every side: room to move a part out by that share of the radius.
 */
export function fitSweep(
  rect: Rect,
  startAngle: number,
  endAngle: number,
  innerRadius: number,
  padding = 0,
): { center: Point; radius: number } {
  const quarters = Array.from({ length: 16 }, (_, i) => (Math.floor(startAngle / 90) + i) * 90).filter(
    (angle) => angle > startAngle && angle < endAngle,
  );
  const outer = [startAngle, endAngle, ...quarters].map(onCircle);
  const inner =
    innerRadius === 0 ? [[0, 0] as Point] : [startAngle, endAngle].map((angle) => scaled(onCircle(angle), innerRadius));
  const xs = [...outer, ...inner].map(([px]) => px);
  const ys = [...outer, ...inner].map(([, py]) => py);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs) - padding,
    Math.max(...xs) + padding,
    Math.min(...ys) - padding,
    Math.max(...ys) + padding,
  ];
  const radius = Math.min((rect.right - rect.left) / (maxX - minX), (rect.bottom - rect.top) / (maxY - minY));
  const center: Point = [
    (rect.left + rect.right) / 2 - (radius * (minX + maxX)) / 2,
    (rect.top + rect.bottom) / 2 - (radius * (minY + maxY)) / 2,
  ];
  return { center, radius };
}

function scaled([px, py]: Point, factor: number): Point {
  return [px * factor, py * factor];
}

/**
 * A slice from `from` to `to` degrees between `hole` and `radius`, a ring when it is a whole turn,
 * with its corners rounded to `corner` where there is room for them.
 */
export function sliceShape([cx, cy]: Point, radius: number, hole: number, from: number, to: number, corner = 0): Shape {
  const whole = isWholeTurn(from, to);
  if (hole === 0 && whole) {
    return { kind: 'circle', cx, cy, diameter: 2 * radius };
  }
  const at = (r: number, angle: number): string => {
    const [px, py] = onCircle(angle);
    return `${coordinate(cx + r * px)} ${coordinate(cy + r * py)}`;
  };
  // An arc whose ends round to one point is dropped, by SVG and the stroke engine alike, as one arc
  // over nearly a whole turn would be. So each edge is two arcs that meet at the middle of the
  // slice, and neither sweeps more than half a turn.
  const middle = (from + to) / 2;
  const arcTo = (r: number, angle: number, clockwise: boolean): string =>
    ` A${coordinate(r)} ${coordinate(r)} 0 0 ${clockwise ? 1 : 0} ${at(r, angle)}`;
  const edge = (r: number, end: number, clockwise: boolean): string =>
    `${arcTo(r, middle, clockwise)}${arcTo(r, end, clockwise)}`;
  if (whole) {
    // A ring: the outer and the inner circle, the inner a hole by the even-odd rule the engine fills
    // paths with.
    const outer = `M${at(radius, from)}${edge(radius, from, true)} Z`;
    return { kind: 'path', d: `${outer} M${at(hole, from)}${edge(hole, from, false)} Z` };
  }
  if (corner > 0) {
    return { kind: 'path', d: roundedSlice(at, edge, [cx, cy], radius, hole, from, to, corner) };
  }
  // A path, not core's arc shape, whose sampling makes a thin slice cost more the thinner it is.
  const start = hole === 0 ? `M${coordinate(cx)} ${coordinate(cy)} L${at(radius, from)}` : `M${at(radius, from)}`;
  const back = hole === 0 ? '' : ` L${at(hole, to)}${edge(hole, from, false)}`;
  return { kind: 'path', d: `${start}${edge(radius, to, true)}${back} Z` };
}

/**
 * A slice's path with its corners rounded: each corner is cut where the edges are `corner` from it,
 * and a quadratic curve through the corner joins the cuts. A corner shrinks to fit half its edges.
 * The tip of a pie slice, at the centre, stays sharp.
 */
function roundedSlice(
  at: (r: number, angle: number) => string,
  edge: (r: number, end: number, clockwise: boolean) => string,
  [cx, cy]: Point,
  radius: number,
  hole: number,
  from: number,
  to: number,
  corner: number,
): string {
  const half = ((to - from) * RADIANS) / 2;
  const outer = Math.min(corner, (radius - hole) / 2, radius * half);
  // The cut along the arc, in degrees.
  const outerTurn = outer / radius / RADIANS;
  const rimStart = `Q${at(radius, from)} ${at(radius, from + outerTurn)}`;
  const rim = `${rimStart}${edge(radius, to - outerTurn, true)} Q${at(radius, to)} ${at(radius - outer, to)}`;
  if (hole === 0) {
    return `M${coordinate(cx)} ${coordinate(cy)} L${at(radius - outer, from)} ${rim} Z`;
  }
  const inner = Math.min(corner, (radius - hole) / 2, hole * half);
  const innerTurn = inner / hole / RADIANS;
  const backStart = `Q${at(hole, to)} ${at(hole, to - innerTurn)}`;
  const back = `${backStart}${edge(hole, from + innerTurn, false)} Q${at(hole, from)} ${at(hole + inner, from)}`;
  return `M${at(radius - outer, from)} ${rim} L${at(hole + inner, to)} ${back} Z`;
}

/** The ticks of a linear angle axis that get a spoke and a label: on a whole turn the end is the start. */
export function rimTicks(scale: Scale, whole: boolean): { ticks: number[]; labels: string[] } {
  const last = scale.ticks.length - 1;
  const repeats =
    whole && last > 0 && scale.fraction(scale.ticks[last]!) === 1 && scale.fraction(scale.ticks[0]!) === 0;
  return repeats ? { ticks: scale.ticks.slice(0, last), labels: scale.labels.slice(0, last) } : scale;
}

/**
 * Which of the first `count` ticks of an angle scale to label, around a circle of `radius`, so labels
 * `width` × `height` do not overlap: thinned as along a straight axis of the arc's length, with room
 * for the label's diagonal, the most it needs whichever way its neighbour lies; and on a whole turn
 * without the last labels that would crowd the first across the start.
 */
export function labelledRim(scale: PlacedScale, count: number, radius: number, [width, height]: [number, number], whole: boolean): number[] {
  const room = Math.sqrt(width * width + height * height);
  const along = (value: number): number => scale.at(value) * RADIANS * radius;
  const shown = scale.labelled(room, along).filter((i) => i < count);
  const turn = 360 * RADIANS * radius;
  while (whole && shown.length > 1 && along(scale.ticks[shown[0]!]!) + turn - along(scale.ticks[shown.at(-1)!]!) < room) {
    shown.pop();
  }
  return shown;
}
