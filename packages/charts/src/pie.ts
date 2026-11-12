import type { Point } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, type Rect } from './frame.js';
import { fitSweep, onCircle, sliceShape } from './geometry.js';
import { shareTitle, valueLabel } from './named-values.js';
import { GRID, hatched, type Paint } from './palette.js';
import type { CheckedPie, CheckedPieChart } from './pie-series.js';
import { fail, show } from './read.js';

type Slice = Pick<CheckedPie['data'][number], 'name' | 'value' | 'offset' | 'radius'>;

/** Where a slice is drawn: between two angles, out to `reach` from `center`, which its pull moves. */
interface DrawnSlice {
  from: number;
  to: number;
  reach: number;
  center: Point;
}

/** The second pie's radius, and the gap before it, as shares of the first pie's. */
const PART_RADIUS = 0.5;
const PART_GAP = 0.5;

const sumOf = (slices: readonly Slice[]) => slices.reduce((total, slice) => total + slice.value, 0);

/** A slice's pull, as a share of the radius: none for a slice that is the whole of its pie, which it would only move. */
const pullOf = (slice: Slice, sum: number) => (slice.value < sum ? slice.offset : 0);

/** The room a pie leaves on every side for the slice it pulls out furthest. */
function roomOf(slices: readonly Slice[]): number {
  const sum = sumOf(slices);
  return Math.max(0, ...slices.map((slice) => pullOf(slice, sum)));
}

/**
 * Lays out a pie or donut, or nested rings of them, into `rect`, reserving room on every side
 * for the largest slice offset. `paintOf` gives each slice name its legend entry's paint.
 */
export function layoutPie(
  drawing: Drawing,
  chart: CheckedPieChart,
  rect: Rect,
  paintOf: ReadonlyMap<string, Paint>,
): void {
  assertRoom(rect, chart.width, chart.height);
  const { series } = chart;
  const { startAngle, endAngle, breakout } = series[0]!;
  if (breakout) {
    layoutPieOfPie(drawing, series[0]!, breakout, rect, paintOf);
    return;
  }
  const outermost = Math.max(...series.map((pie) => pie.outerRadius));
  const innermost = Math.min(...series.map((pie) => pie.innerRadius));
  const offset = Math.max(...series.map((pie) => roomOf(pie.data)));
  const fitted = fitSweep(rect, startAngle, endAngle, innermost / outermost, offset);
  const { center } = fitted;
  const radius = fitted.radius / outermost;
  for (const pie of series) {
    drawRing(drawing, pie, pie.data, center, radius, outermost, [startAngle, endAngle], rect, paintOf, series.length === 1 ? '' : `${pie.name}, `);
  }
}

/**
 * Draws `slices` as a ring of `pie` around `center`, its radii `radius` times the pie's, from
 * `startAngle` to `endAngle`, each slice a mark whose tooltip starts with `prefix`. Returns where
 * each slice is drawn, or undefined for one with nothing to draw.
 */
function drawRing(
  drawing: Drawing, pie: CheckedPie, slices: readonly Slice[], center: Point, radius: number, outermost: number,
  [startAngle, endAngle]: [number, number], rect: Rect, paintOf: ReadonlyMap<string, Paint>, prefix: string,
): (DrawnSlice | undefined)[] {
  const sum = sumOf(slices);
  const reachOf = reaches(slices, radius * pie.outerRadius, radius * pie.innerRadius);
  const hole = radius * pie.innerRadius;
  // Space between slices only where there is more than one slice to part.
  const pad = slices.filter((slice) => slice.value > 0).length > 1 ? pie.padAngle / 2 : 0;
  let angle = startAngle;
  return slices.map((slice) => {
    const from = angle;
    angle += (slice.value / sum) * (endAngle - startAngle);
    // A slice whose sweep rounds to nothing, or that the space between slices takes up, has nothing
    // to draw.
    if (!(angle - pad > from + pad)) {
      return undefined;
    }
    const reach = reachOf(slice);
    // A slice that reaches no further than the hole has nothing to draw either.
    if (!(reach > hole)) {
      return undefined;
    }
    // Pulled out by a share of the outermost ring's radius.
    const pull = pullOf(slice, sum) * radius * outermost;
    const [dx, dy] = onCircle((from + angle) / 2);
    const pulled: Point = pull === 0 ? center : [center[0] + pull * dx, center[1] + pull * dy];
    drawing.mark(shareTitle(slice, sum, prefix), [
      drawing.shape(
        sliceShape(pulled, reach, hole, from + pad, angle - pad, pie.cornerRadius),
        hatched(paintOf.get(slice.name)!),
        [pie.name, slice.name, 'slice'],
        pie.style,
      ),
      ...(pie.dataLabels ? [drawing.label(valueLabel(slice),
        pulled[0] + dx * (hole + reach) / 2, pulled[1] + dy * (hole + reach) / 2,
        rect, `${pie.path}.dataLabels`)] : []),
    ]);
    return { from, to: angle, reach, center: pulled };
  });
}

/**
 * How far each slice reaches: to `outer`, or with per-slice radii, from `hole` out by its share of
 * the largest radius.
 */
function reaches(slices: readonly Slice[], outer: number, hole: number): (slice: Slice) => number {
  const largest = Math.max(...slices.map((slice) => slice.radius ?? 0));
  return (slice) => (slice.radius === undefined ? outer : hole + ((outer - hole) * slice.radius) / largest);
}

/**
 * A pie with one slice broken out into a second pie of its parts, half as wide, to its right. The
 * pie turns so that the middle of the slice faces the second pie, and two lines join the slice's
 * edges, where it is drawn, to the second pie's top and foot. Its parts' shares are of the slice.
 */
function layoutPieOfPie(
  drawing: Drawing, pie: CheckedPie, breakout: NonNullable<CheckedPie['breakout']>, rect: Rect, paintOf: ReadonlyMap<string, Paint>,
): void {
  const { slice, index } = breakout;
  const sum = sumOf(pie.data);
  const half = (slice.value / sum) * 180;
  const startAngle = 90 - (sumOf(pie.data.slice(0, index)) / sum) * 360 - half;
  const room = roomOf(pie.data);
  // Across: the first pie and its room, the gap, and the second pie, in radii of the first.
  const across = 2 * (1 + room) + PART_GAP + 2 * PART_RADIUS;
  const radius = Math.min((rect.right - rect.left) / across, (rect.bottom - rect.top) / (2 * (1 + room)));
  const left = (rect.left + rect.right - across * radius) / 2;
  const middle = (rect.top + rect.bottom) / 2;
  const center: Point = [left + (1 + room) * radius, middle];
  const partCenter: Point = [left + (across - PART_RADIUS) * radius, middle];
  const scale = radius / pie.outerRadius;
  const drawn = drawRing(drawing, pie, pie.data, center, scale, pie.outerRadius, [startAngle, startAngle + 360], rect, paintOf, '')[index]
    ?? fail(`${pie.path}.breakout.slice`, `is ${show(slice.name)}, which the space between slices takes up, so it is not drawn and there is nothing to break out`);
  const edge = (angle: number): Point => {
    const [dx, dy] = onCircle(angle);
    return [drawn.center[0] + drawn.reach * dx, drawn.center[1] + drawn.reach * dy];
  };
  const [top, foot] = [edge(drawn.from), edge(drawn.to)];
  const partReach = PART_RADIUS * radius;
  drawing.push(
    drawing.outline({ kind: 'line', x1: top[0], y1: top[1], x2: partCenter[0], y2: middle - partReach }, { stroke: GRID }, [pie.name, 'connector', 0]),
    drawing.outline({ kind: 'line', x1: foot[0], y1: foot[1], x2: partCenter[0], y2: middle + partReach }, { stroke: GRID }, [pie.name, 'connector', 1]),
  );
  const parts = breakout.data.map((part) => ({ ...part, offset: 0, radius: undefined }));
  drawRing(drawing, pie, parts, partCenter, scale * PART_RADIUS, pie.outerRadius, [0, 360], rect, paintOf, `${slice.name}, `);
}
