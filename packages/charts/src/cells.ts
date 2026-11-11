// Cells coloured by value on a chart with x and y axes: heatmaps, and the folded layers of horizon rows.
import type { Point, Shape } from '@borrowdale/core';
import type { MarkContext, Placed } from './cartesian.js';
import type { CheckedPlace } from './cell-series.js';
import { colorAxisOf, inkOn } from './color-scale.js';
import type { Rect } from './frame.js';
import { runsOf, solid, valueCell, valueTitle } from './marks.js';
import type { ChartNode } from './types.js';
import type { SeriesOf } from './validate.js';

type Heatmap = Extract<SeriesOf<'cartesian'>, { type: 'heatmap' }>;
type Horizon = Extract<SeriesOf<'cartesian'>, { type: 'horizon' }>;

/**
 * The shape of a cell of each display inside its box, or none; `share` is its value's size as a
 * share of the largest. A `Record`, so a display added without its shape fails to compile.
 */
const CELL_SHAPES: Record<Heatmap['display'], (box: Rect, share: number) => Shape | undefined> = {
  rect: rectangle,
  // Its area, not its diameter, grows with the value's size.
  circle: ({ left, top, right, bottom }, share) => share === 0 ? undefined : {
    kind: 'circle', cx: (left + right) / 2, cy: (top + bottom) / 2, diameter: Math.min(right - left, bottom - top) * Math.sqrt(share),
  },
  // Flat-topped, its corners a quarter of the way along the top and bottom of its box.
  hex: ({ left, top, right, bottom }) => {
    const [quarter, middle] = [(right - left) / 4, (top + bottom) / 2];
    return { kind: 'polygon', points: [[right, middle], [right - quarter, bottom], [left + quarter, bottom], [left, middle], [left + quarter, top], [right - quarter, top]] };
  },
};

function rectangle({ left, top, right, bottom }: Rect): Shape {
  return { kind: 'rectangle', x: left, y: top, width: right - left, height: bottom - top };
}

/** Each cell in the colour of its value; a cell with no value as an outline only. */
export function drawHeatmap(context: MarkContext, entry: Heatmap): void {
  const { drawing, frame, span } = context;
  const color = colorAxisOf(context.color, entry.path);
  const largest = entry.data.reduce((most, cell) => Math.max(most, Math.abs(cell.value ?? 0)), 0);
  entry.data.forEach((cell, i) => {
    const [left, right] = ordered(span('x', cell.x));
    const [top, bottom] = ordered(span('y', cell.y));
    const box = { left, top, right, bottom };
    const key = [entry.name, 'cell', i];
    const nodes: ChartNode[] = [];
    // A cell with no value is outlined at its full size; a circle shrinks with its value's size.
    const shape = CELL_SHAPES[entry.display](box, cell.value === null ? 1 : largest === 0 ? 0 : Math.abs(cell.value) / largest);
    if (shape) nodes.push(valueCell(drawing, shape, cell.value, color, key, entry.style));
    if (cell.value !== null && entry.dataLabels) {
      const label = drawing.label(color.format(cell.value), (left + right) / 2, (top + bottom) / 2, frame.plot, `${entry.path}.dataLabels`);
      // Written on the cell, so in an ink that stands out from it; a circle can leave it on the page.
      const ink = shape && entry.display !== 'circle' ? inkOn(color.color(cell.value)) : undefined;
      nodes.push(ink && label.kind === 'text' ? { ...label, fill: ink } : label);
    }
    const place = entry.display === 'hex'
      ? `${cell.given[0]}, ${cell.given[1]}`
      : `${context.placeName('x', cell.x)}, ${context.placeName('y', cell.y)}`;
    drawing.mark(valueTitle(entry.name, place, cell.value, color), nodes);
  });
}

/**
 * A row folded into layers: each layer is the part of the values between two multiples of the
 * colour axis' end over `layers`, drawn up from the row's baseline in the next darker class. Negative
 * values are folded the same way, in the classes below 0, mirrored up from the baseline or hanging
 * down from the top of the row.
 */
export function drawHorizon(context: MarkContext, { entry, scale }: Placed<Horizon>): void {
  const { drawing, frame } = context;
  const color = colorAxisOf(context.color, entry.path);
  const legend = color.legend;
  if (legend.kind !== 'classes') throw new Error(`${entry.path} has no classed colour axis`);
  const row = frame.band(entry.category);
  const layer = color.domain[1] / entry.layers;
  const nodes: ChartNode[] = [];
  runsOf(entry.data).forEach((run, r) => {
    for (let k = 0; k < entry.layers; k++) {
      for (const sign of [1, -1]) {
        const heights = folded(run.map(([x, value]) => [x, sign * value]), k * layer, (k + 1) * layer);
        if (heights.every(([, height]) => height === 0)) continue;
        const hanging = sign < 0 && entry.mode === 'offset';
        const base = hanging ? row.start : row.start + row.width;
        const toward = hanging ? 1 : -1;
        const top = heights.map(([x, height]): Point => [scale.at(x), base + (toward * row.width * height) / layer]);
        const points: Point[] = [...top, [top.at(-1)![0], base], [top[0]![0], base]];
        const fill = legend.colors[sign > 0 ? entry.layers + k : entry.layers - 1 - k]!;
        nodes.push(drawing.shape({ kind: 'polygon', points }, solid(fill), [entry.name, 'horizon', r, k, sign], entry.style));
      }
    }
  });
  drawing.mark(`${entry.name}, ${entry.row}`, nodes);
}

/**
 * The part of a run between `low` and `high`, as heights above `low`: each point clamped, with a
 * point added wherever the line between two points crosses either level.
 */
function folded(run: readonly (readonly [number, number])[], low: number, high: number): [number, number][] {
  const heights: [number, number][] = [];
  run.forEach(([x, value], i) => {
    const before = run[i - 1];
    if (before) {
      const [px, pv] = before;
      for (const level of pv < value ? [low, high] : [high, low]) {
        if ((pv - level) * (value - level) < 0) heights.push([px + ((x - px) * (level - pv)) / (value - pv), level - low]);
      }
    }
    heights.push([x, Math.min(high, Math.max(low, value)) - low]);
  });
  return heights;
}

function ordered([a, b]: [number, number]): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

/** A cell's place on one axis, as a tooltip names it. */
export type PlaceName = (axis: 'x' | 'y', place: CheckedPlace) => string;
