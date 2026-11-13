// Lays out a Venn diagram: the circles placed as the spec was read, scaled to fill the chart, each
// hatched in its set's paint so that overlaps show both, and each region's own size written in it.
import type { Drawing } from './drawing.js';
import { assertRoom, type Rect } from './frame.js';
import { valueLabel } from './named-values.js';
import { hatched, type Paint } from './palette.js';
import { circleBounds, regionSpots, type Circle } from './venn-geometry.js';
import { sizeText, type CheckedVennChart } from './venn-series.js';

/** `paintOf` gives each set name its legend entry's paint. */
export function layoutVenn(drawing: Drawing, chart: CheckedVennChart, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  assertRoom(rect, chart.width, chart.height);
  const venn = chart.series[0]!;
  const circles = fitted(venn.circles, rect);
  venn.sets.forEach((set, i) => {
    const { x, y, r } = circles[i]!;
    const shape = { kind: 'circle' as const, cx: x, cy: y, diameter: 2 * r };
    drawing.mark(valueLabel(set), [drawing.shape(shape, hatched(paintOf.get(set.name)!), [venn.name, set.name], venn.style)]);
  });
  if (!venn.dataLabels) return;
  const spots = regionSpots(circles);
  venn.exclusive.forEach((size, mask) => {
    const spot = size > 0 ? spots.get(mask) : undefined;
    if (spot) drawing.push(drawing.label(sizeText(size), spot.x, spot.y, rect, `${venn.path}.data`));
  });
}

/** The circles scaled by one factor to fit `rect`, and centred in it. */
function fitted(circles: readonly Circle[], rect: Rect): Circle[] {
  const { left, top, right, bottom } = circleBounds(circles);
  const scale = Math.min((rect.right - rect.left) / (right - left), (rect.bottom - rect.top) / (bottom - top));
  const [dx, dy] = [(rect.left + rect.right) / 2 - (scale * (left + right)) / 2, (rect.top + rect.bottom) / 2 - (scale * (top + bottom)) / 2];
  return circles.map((c) => ({ x: dx + scale * c.x, y: dy + scale * c.y, r: scale * c.r }));
}
