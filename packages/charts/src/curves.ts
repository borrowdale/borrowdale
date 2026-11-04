// Points here are [along, value]: `along` is the position on the band axis, which increases from one
// point to the next, and `value` the position on the value axis. `horizontal` turns them into
// [x, y] for a chart whose band axis is y.
import type { Point } from '@borrowdale/core';
import type { Curve } from './types.js';

interface Command {
  to: Point;
  /** Control points of a cubic Bézier; a straight line without them. */
  controls?: [Point, Point];
}

/** SVG path data for a line through the points. */
export function linePath(points: readonly Point[], curve: Curve, horizontal: boolean): string {
  const rest = commands(points, curve).map((command) => draw(command, horizontal));
  return `M${xy(points[0]!, horizontal)}${rest.join('')}`;
}

/** SVG path data for the area between two lines over the same positions, `top` drawn first. */
export function areaPath(top: readonly Point[], bottom: readonly Point[], curve: Curve, horizontal: boolean): string {
  const back = reversed(bottom, commands(bottom, curve));
  return `M${xy(top[0]!, horizontal)}${[...commands(top, curve), { to: bottom.at(-1)! }, ...back]
    .map((command) => draw(command, horizontal))
    .join('')} Z`;
}

/**
 * The corners of a line through the points, as [x, y], for a curve made of straight segments; none
 * for a curve that bends between them.
 */
export function straightPoints(points: readonly Point[], curve: Curve, horizontal: boolean): Point[] | undefined {
  if (curve === 'monotone') {
    return undefined;
  }
  return [points[0]!, ...commands(points, curve).map((command) => command.to)].map(([along, value]) =>
    horizontal ? [value, along] : [along, value],
  );
}

function commands(points: readonly Point[], curve: Curve): Command[] {
  switch (curve) {
    case 'linear':
      return points.slice(1).map((to) => ({ to }));
    case 'step':
      return points.slice(1).flatMap((to, i) => {
        const [along, value] = points[i]!;
        const middle = (along + to[0]) / 2;
        return [{ to: [middle, value] as Point }, { to: [middle, to[1]] as Point }, { to }];
      });
    case 'step-before':
      return points.slice(1).flatMap((to, i) => [{ to: [points[i]![0], to[1]] as Point }, { to }]);
    case 'step-after':
      return points.slice(1).flatMap((to, i) => [{ to: [to[0], points[i]![1]] as Point }, { to }]);
    case 'monotone':
      return monotone(points);
  }
}

/**
 * Cubic segments whose value never goes beyond its two end points between them (Fritsch and
 * Carlson's monotone interpolation), so a smoothed line never overshoots the data. Arithmetic and
 * `Math.sqrt` only, which are exact or correctly rounded in every engine.
 */
function monotone(points: readonly Point[]): Command[] {
  const widths = points.slice(1).map((point, i) => point[0] - points[i]![0]);
  const slopes = points.slice(1).map((point, i) => (point[1] - points[i]![1]) / widths[i]!);
  const tangents = points.map((_, i) => {
    if (i === 0) {
      return slopes[0]!;
    }
    if (i === points.length - 1) {
      return slopes[i - 1]!;
    }
    const [before, after] = [slopes[i - 1]!, slopes[i]!];
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  // Tangents too steep for their segment are scaled back, which is what keeps it monotone.
  slopes.forEach((slope, i) => {
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      return;
    }
    const a = tangents[i]! / slope;
    const b = tangents[i + 1]! / slope;
    const length = a * a + b * b;
    if (length > 9) {
      const scale = 3 / Math.sqrt(length);
      tangents[i] = scale * a * slope;
      tangents[i + 1] = scale * b * slope;
    }
  });
  return points.slice(1).map((to, i) => {
    const from = points[i]!;
    const third = widths[i]! / 3;
    return {
      to,
      controls: [
        [from[0] + third, from[1] + tangents[i]! * third],
        [to[0] - third, to[1] - tangents[i + 1]! * third],
      ],
    };
  });
}

/** The same path traversed from its last point back to `points[0]`. */
function reversed(points: readonly Point[], forward: readonly Command[]): Command[] {
  const vertices = [points[0]!, ...forward.map((command) => command.to)];
  return forward
    .map((command, i) => ({
      to: vertices[i]!,
      ...(command.controls ? { controls: [command.controls[1], command.controls[0]] as [Point, Point] } : {}),
    }))
    .reverse();
}

function draw({ to, controls }: Command, horizontal: boolean): string {
  if (!controls) {
    return ` L${xy(to, horizontal)}`;
  }
  return ` C${xy(controls[0], horizontal)} ${xy(controls[1], horizontal)} ${xy(to, horizontal)}`;
}

function xy([along, value]: Point, horizontal: boolean): string {
  return horizontal ? `${coordinate(value)} ${coordinate(along)}` : `${coordinate(along)} ${coordinate(value)}`;
}

/** A number for path data: two decimals, as the stroke engine rounds its own output. */
export function coordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}
