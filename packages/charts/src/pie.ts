import type { Point } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, type Rect } from './frame.js';
import { fitSweep, isWholeTurn, onCircle, sliceShape } from './geometry.js';
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
  // Room for pulling slices out; a slice of the whole of its pie is never pulled.
  const offset = Math.max(
    ...series.flatMap((pie) => pie.data.filter((slice) => slice.value < total(pie)).map((slice) => slice.offset)),
    0,
  );
  const fitted = fitSweep(rect, startAngle, endAngle, innermost / outermost);
  const { center } = fitted;
  const radius = (offset === 0 ? fitted.radius : fitted.radius / (1 + offset)) / outermost;

  for (const pie of series) {
    const sum = total(pie);
    const largest = Math.max(...pie.data.map((slice) => slice.radius ?? 0));
    const [outer, hole] = [radius * pie.outerRadius, radius * pie.innerRadius];
    // Space between slices only where there is more than one slice to part.
    const pad = pie.data.filter((slice) => slice.value > 0).length > 1 ? pie.padAngle / 2 : 0;
    let angle = startAngle;
    pie.data.forEach((slice) => {
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
      // Pulled out by a share of the outermost ring's radius; a slice of the whole turn stays put.
      const pull = slice.offset * radius * outermost;
      const [dx, dy] = onCircle((from + angle) / 2);
      const pulled: Point =
        pull === 0 || isWholeTurn(from + pad, angle - pad) ? center : [center[0] + pull * dx, center[1] + pull * dy];
      const share = formatNumber((slice.value / sum) * 100, 1, PLAIN_FORMAT);
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

function total(pie: CheckedPieChart['series'][number]): number {
  return pie.data.reduce((sum, slice) => sum + slice.value, 0);
}
