import type { Point } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, type Rect } from './frame.js';
import { fitSweep, onCircle, sliceShape } from './geometry.js';
import { hatched, type Paint } from './palette.js';
import { formatNumber, formatValue, PLAIN_FORMAT } from './scale.js';
import type { CheckedPieChart } from './validate.js';

/**
 * Lays out a pie or donut, or nested rings of them, into `rect`, as large as fits with every slice
 * pulled out by its offset. `paintOf` gives each slice name its legend entry's paint.
 */
export function layoutPie(drawing: Drawing, chart: CheckedPieChart, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  assertRoom(rect, chart.width, chart.height);
  const { series } = chart;
  const { startAngle, endAngle } = series[0]!;
  const outermost = Math.max(...series.map((pie) => pie.outerRadius));
  const innermost = Math.min(...series.map((pie) => pie.innerRadius));
  const offset = Math.max(...series.flatMap((pie) => pie.data.map((slice) => slice.offset)));
  const fitted = fitSweep(rect, startAngle, endAngle, innermost / outermost);
  const { center } = fitted;
  const radius = (offset === 0 ? fitted.radius : fitted.radius / (1 + offset)) / outermost;

  for (const pie of series) {
    const total = pie.data.reduce((sum, slice) => sum + slice.value, 0);
    const largest = Math.max(...pie.data.map((slice) => slice.radius ?? 0));
    const [outer, hole] = [radius * pie.outerRadius, radius * pie.innerRadius];
    // Space between slices only where there is more than one slice to part.
    const pad = pie.data.filter((slice) => slice.value > 0).length > 1 ? pie.padAngle / 2 : 0;
    let angle = startAngle;
    pie.data.forEach((slice) => {
      const from = angle;
      angle += (slice.value / total) * (endAngle - startAngle);
      // A slice whose sweep rounds to nothing, or that the space between slices takes up, has nothing
      // to draw.
      if (!(angle - pad > from + pad)) {
        return;
      }
      const reach = slice.radius === undefined ? outer : hole + ((outer - hole) * slice.radius) / largest;
      const [dx, dy] = onCircle((from + angle) / 2);
      const pulled: Point = slice.offset === 0 ? center : [center[0] + slice.offset * radius * dx, center[1] + slice.offset * radius * dy];
      const share = formatNumber((slice.value / total) * 100, 1, PLAIN_FORMAT);
      const ring = series.length === 1 ? '' : `${pie.name}, `;
      drawing.mark(`${ring}${slice.name}: ${formatValue(slice.value)} (${share}%)`, [
        drawing.shape(
          sliceShape(pulled, reach, hole, from + pad, angle - pad, pie.cornerRadius),
          hatched(paintOf.get(slice.name)!),
          `${pie.name}|${slice.name}|slice`,
          pie.style,
        ),
      ]);
    });
  }
}
