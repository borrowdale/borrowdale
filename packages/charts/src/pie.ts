import type { Point } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, type Rect } from './frame.js';
import { fitSweep, onCircle, sliceShape } from './geometry.js';
import { GRID, hatched, type Paint } from './palette.js';
import { formatNumber, formatValue, PLAIN_FORMAT } from './scale.js';
import type { CheckedPie, CheckedPieChart } from './validate.js';

type Slice = Pick<CheckedPie['data'][number], 'name' | 'value' | 'offset' | 'radius'>;

/** The second pie's radius, and the gap before it, as shares of the first pie's. */
const PART_RADIUS = 0.5;
const PART_GAP = 0.5;

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
  const totals = new Map(series.map((pie) => [pie, pie.data.reduce((sum, slice) => sum + slice.value, 0)]));
  // A slice that is the whole of its pie is never pulled out: it would only move the pie.
  const pulls = (pie: CheckedPie, slice: CheckedPie['data'][number]): boolean => slice.value < totals.get(pie)!;
  // Room for pulling slices out.
  const offset = Math.max(
    ...series.flatMap((pie) => pie.data.filter((slice) => pulls(pie, slice)).map((slice) => slice.offset)),
    0,
  );
  const fitted = fitSweep(rect, startAngle, endAngle, innermost / outermost, offset);
  const { center } = fitted;
  const radius = fitted.radius / outermost;
  for (const pie of series) {
    drawRing(drawing, pie, pie.data, center, radius, outermost, [startAngle, endAngle], rect, paintOf, series.length === 1 ? '' : `${pie.name}, `);
  }
}

/**
 * Draws `slices` as a ring of `pie` around `center`, its radii `radius` times the pie's, from
 * `startAngle` to `endAngle`, each slice a mark whose tooltip starts with `prefix`.
 */
function drawRing(
  drawing: Drawing, pie: CheckedPie, slices: readonly Slice[], center: Point, radius: number, outermost: number,
  [startAngle, endAngle]: [number, number], rect: Rect, paintOf: ReadonlyMap<string, Paint>, prefix: string,
): void {
  const sum = slices.reduce((total, slice) => total + slice.value, 0);
  const largest = Math.max(...slices.map((slice) => slice.radius ?? 0));
  const [outer, hole] = [radius * pie.outerRadius, radius * pie.innerRadius];
  // Space between slices only where there is more than one slice to part.
  const pad = slices.filter((slice) => slice.value > 0).length > 1 ? pie.padAngle / 2 : 0;
  let angle = startAngle;
  slices.forEach((slice) => {
    const from = angle;
    angle += (slice.value / sum) * (endAngle - startAngle);
    // A slice whose sweep rounds to nothing, or that the space between slices takes up, has nothing
    // to draw.
    if (!(angle - pad > from + pad)) {
      return;
    }
    const reach = slice.radius === undefined ? outer : hole + ((outer - hole) * slice.radius) / largest;
    // A slice that reaches no further than the hole has nothing to draw either.
    if (!(reach > hole)) {
      return;
    }
    // Pulled out by a share of the outermost ring's radius; a slice that is the whole of its pie is not.
    const pull = slice.value < sum ? slice.offset * radius * outermost : 0;
    const [dx, dy] = onCircle((from + angle) / 2);
    const pulled: Point = pull === 0 ? center : [center[0] + pull * dx, center[1] + pull * dy];
    const percent = formatNumber((slice.value / sum) * 100, 1, PLAIN_FORMAT);
    drawing.mark(`${prefix}${slice.name}: ${formatValue(slice.value)} (${percent}%)`, [
      drawing.shape(
        sliceShape(pulled, reach, hole, from + pad, angle - pad, pie.cornerRadius),
        hatched(paintOf.get(slice.name)!),
        [pie.name, slice.name, 'slice'],
        pie.style,
      ),
      ...(pie.dataLabels ? [drawing.label(`${slice.name}: ${formatValue(slice.value)}`,
        pulled[0] + dx * (hole + reach) / 2, pulled[1] + dy * (hole + reach) / 2,
        rect, `${pie.path}.dataLabels`)] : []),
    ]);
  });
}

/**
 * A pie with one slice broken out into a second pie of its parts, half as wide, to its right. The
 * pie turns so that the middle of the slice faces the second pie, and two lines join the slice's
 * edge to the second pie's top and foot. Its parts' shares are of the slice.
 */
function layoutPieOfPie(
  drawing: Drawing, pie: CheckedPie, breakout: NonNullable<CheckedPie['breakout']>, rect: Rect, paintOf: ReadonlyMap<string, Paint>,
): void {
  const sum = pie.data.reduce((total, slice) => total + slice.value, 0);
  const at = pie.data.findIndex((slice) => slice.name === breakout.slice);
  const slice = pie.data[at]!;
  const before = pie.data.slice(0, at).reduce((total, item) => total + item.value, 0);
  const half = (slice.value / sum) * 180;
  const startAngle = 90 - (before / sum) * 360 - half;
  const pull = slice.value < sum ? slice.offset : 0;
  // Across: the first pie, its slice's pull, the gap, and the second pie, in radii of the first.
  const across = 2 + pull + PART_GAP + 2 * PART_RADIUS;
  const radius = Math.min((rect.right - rect.left) / across, (rect.bottom - rect.top) / 2);
  const left = (rect.left + rect.right - across * radius) / 2;
  const middle = (rect.top + rect.bottom) / 2;
  const center: Point = [left + radius, middle];
  const partCenter: Point = [left + (across - PART_RADIUS) * radius, middle];
  const scale = radius / pie.outerRadius;
  drawRing(drawing, pie, pie.data, center, scale, pie.outerRadius, [startAngle, startAngle + 360], rect, paintOf, '');
  // From the slice's edge, pulled out as the slice is, to the second pie's top and foot.
  const edge = (angle: number): Point => {
    const [dx, dy] = onCircle(angle);
    return [center[0] + pull * radius + radius * dx, center[1] + radius * dy];
  };
  const [top, foot] = [edge(90 - half), edge(90 + half)];
  const reach = PART_RADIUS * radius;
  drawing.push(
    drawing.shape({ kind: 'line', x1: top[0], y1: top[1], x2: partCenter[0], y2: middle - reach }, { stroke: GRID }, [pie.name, 'connector', 0]),
    drawing.shape({ kind: 'line', x1: foot[0], y1: foot[1], x2: partCenter[0], y2: middle + reach }, { stroke: GRID }, [pie.name, 'connector', 1]),
  );
  const parts = breakout.data.map((part) => ({ ...part, offset: 0, radius: undefined }));
  drawRing(drawing, pie, parts, partCenter, scale * PART_RADIUS, pie.outerRadius, [0, 360], rect, paintOf, `${slice.name}, `);
}
