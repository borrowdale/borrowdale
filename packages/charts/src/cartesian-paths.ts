import type { Point, SketchStyle } from '@borrowdale/core';
import type { CheckedLinearAxis } from './check-axis.js';
import type { Drawing } from './drawing.js';
import type { Rect } from './frame.js';
import { loneDot, POINT_SIZE, runsOf, solid } from './marks.js';
import { hatched, LINE_WIDTH, type Paint } from './palette.js';
import { formatAxisValue, type PlacedScale } from './scale.js';
import { markerNode } from './symbols.js';
import type { ChartNode } from './types.js';
import type { SeriesOf } from './validate.js';

type XYLine = Extract<SeriesOf<'cartesian'>, { type: 'xyLine' }>;
type XYArea = Extract<SeriesOf<'cartesian'>, { type: 'xyArea' }>;
interface Context { drawing: Drawing; x: PlacedScale | undefined; frame: { plot: Rect } }
interface Placed<T> { entry: T; scale: PlacedScale; axis: CheckedLinearAxis }

export function drawXYLine({ drawing, x, frame }: Context, { entry, scale, axis }: Placed<XYLine>, paint: Paint): void {
  const points = entry.data.map((point) => point && [x!.at(point[0]), scale.at(point[1])] as Point);
  const style = { stroke: paint.color, strokeWidth: LINE_WIDTH, ...(entry.dash ? { strokeLineDash: entry.dash } : {}) };
  const nodes: ChartNode[] = [];
  if (entry.widths) {
    points.forEach((point, i) => {
      if (!point) return;
      const width = entry.widths![i]!;
      const next = points[i + 1];
      if (width > 0) nodes.push(drawing.shape({ kind: 'circle', cx: point[0], cy: point[1], diameter: width },
        { ...solid(paint.color), stroke: 'none' }, [entry.name, 'join', i], entry.style));
      if (!next) return;
      const nextWidth = entry.widths![i + 1]!;
      const dx = next[0] - point[0], dy = next[1] - point[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length === 0 || (width === 0 && nextWidth === 0)) return;
      const nx = -dy / length / 2, ny = dx / length / 2;
      nodes.push(drawing.shape({ kind: 'polygon', points: [
        [point[0] + nx * width, point[1] + ny * width], [next[0] + nx * nextWidth, next[1] + ny * nextWidth],
        [next[0] - nx * nextWidth, next[1] - ny * nextWidth], [point[0] - nx * width, point[1] - ny * width],
      ] }, { ...solid(paint.color), stroke: 'none' }, [entry.name, 'taper', i], entry.style));
    });
  } else if (entry.segments) {
    points.forEach((point, i) => {
      if (!point) return;
      const next = points[i + 1];
      if (next) {
        const segment = entry.segments![i];
        const own: SketchStyle = { ...entry.style,
          ...(segment?.color === undefined ? {} : { stroke: segment.color }),
          ...(segment?.width === undefined ? {} : { strokeWidth: segment.width }),
          ...(segment?.dash === undefined ? {} : { strokeLineDash: segment.dash }) };
        nodes.push(drawing.outline({ kind: 'linearPath', points: [point, next] }, style, [entry.name, 'segment', i], own));
      } else if (!points[i - 1]) nodes.push(loneDot(drawing, point, paint.color, [entry.name, 'point', i], entry.style));
    });
  } else {
    nodes.push(...runsOf(points).map((run, i) => run.length === 1
      ? loneDot(drawing, run[0]!, paint.color, [entry.name, 'run', i], entry.style)
      : drawing.outline({ kind: 'linearPath', points: run }, style, [entry.name, 'run', i], entry.style)));
  }
  if (entry.gradient) {
    const { plot } = frame;
    const from: Point = [plot.left, plot.bottom];
    const to: Point = entry.gradient.axis === 'x' ? [plot.right, plot.bottom] : [plot.left, plot.top];
    nodes.forEach((node, i) => {
      if (node.kind === 'sketch') nodes[i] = { kind: 'gradient', sketch: node.sketch, from, to, stops: entry.gradient!.stops };
    });
  }
  points.forEach((point, i) => {
    if (point && entry.symbol) nodes.push(markerNode(drawing, entry.symbol, point, POINT_SIZE,
      solid(paint.color), [entry.name, 'point', i], entry.style));
    if (point && entry.dataLabels) nodes.push(drawing.label(formatAxisValue(entry.data[i]![1], axis),
      point[0], point[1], frame.plot, `${entry.path}.dataLabels`));
  });
  drawing.mark(entry.name, nodes);
}

export function drawXYArea({ drawing, x }: Context, { entry, scale }: Placed<XYArea>, paint: Paint): void {
  const nodes: ChartNode[] = [];
  runsOf(entry.data).forEach((run, i) => {
    const low = run.map(([px, value]): Point => [x!.at(px), scale.at(value)]);
    const high = run.map(([px, , value]): Point => [x!.at(px), scale.at(value)]);
    const outline = { stroke: paint.color, strokeWidth: LINE_WIDTH };
    if (run.length === 1) {
      nodes.push(drawing.outline({ kind: 'linearPath', points: [low[0]!, high[0]!] }, outline,
        [entry.name, 'range', i], entry.style));
    } else {
      if (entry.difference) {
        for (let j = 0; j + 1 < run.length; j++) {
          const a = run[j]!, b = run[j + 1]!;
          const da = a[2] - a[1], db = b[2] - b[1];
          const fill = (points: Point[], positive: boolean, part: number): void => {
            const color = positive ? entry.difference!.positive : entry.difference!.negative;
            nodes.push(drawing.shape({ kind: 'polygon', points }, { ...solid(color), stroke: 'none' },
              [entry.name, 'difference', i, j, part], entry.style));
          };
          if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
            // Where the edges cross on the plot: the placed heights give it on any scale, the values'
            // own differences only on a linear one. Heights the plot places alike, both 0 on an axis
            // too wide to tell them apart, fall back to the values'.
            const [pa, pb] = [high[j]![1] - low[j]![1], high[j + 1]![1] - low[j + 1]![1]];
            const t = pa === pb ? da / (da - db) : pa / (pa - pb);
            const crossing: Point = [low[j]![0] + (low[j + 1]![0] - low[j]![0]) * t,
              low[j]![1] + (low[j + 1]![1] - low[j]![1]) * t];
            fill([low[j]!, high[j]!, crossing], da > 0, 0);
            fill([crossing, high[j + 1]!, low[j + 1]!], db > 0, 1);
          } else if (da !== 0 || db !== 0) fill([low[j]!, high[j]!, high[j + 1]!, low[j + 1]!], (da || db) > 0, 0);
        }
      } else nodes.push(drawing.shape({ kind: 'polygon', points: [...high, ...low.slice().reverse()] },
        { ...hatched(paint), stroke: 'none' }, [entry.name, 'fill', i], entry.style));
      for (const [edge, points] of [low, high].entries()) {
        nodes.push(drawing.outline({ kind: 'linearPath', points }, outline, [entry.name, 'edge', i, edge], entry.style));
      }
    }
  });
  drawing.mark(entry.name, nodes);
}
