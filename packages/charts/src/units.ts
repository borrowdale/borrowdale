// Lays out a unit chart: each category's units, in order, as the cells of a waffle, the seats of a
// parliament, rows of pictograms, or the segments of a ring.
import type { Point } from '@borrowdale/core';
import type { Drawing } from './drawing.js';
import { assertRoom, GAP, type Rect } from './frame.js';
import { fitSweep, onCircle, RADIANS, sliceShape } from './geometry.js';
import { solid } from './marks.js';
import { valueLabel } from './named-values.js';
import type { Paint } from './palette.js';
import { unhandled } from './statistics/types.js';
import { markerNode } from './symbols.js';
import type { ChartNode } from './types.js';
import { unitSymbol, type CheckedUnitsChart } from './units-series.js';

/** The share of a unit's cell its symbol fills, leaving a gap between units. */
const FILL = 0.8;
/** The widest the names beside pictogram rows may be, as a share of the chart's width. */
const NAME_SHARE = 1 / 3;

type Units = CheckedUnitsChart['series'][number];
/**
 * Where the `k`th unit of category `category`, the `index`th of the series, is drawn, and the size of
 * its symbol.
 */
type Place = (category: number, k: number, index: number) => { center: Point; size: number };

/** Where each count starts in their running total. */
function startsOf(counts: readonly number[]): number[] {
  let sum = 0;
  return counts.map((count) => (sum += count) - count);
}

/** `paintOf` gives each category name its legend entry's paint. */
export function layoutUnits(drawing: Drawing, chart: CheckedUnitsChart, rect: Rect, paintOf: ReadonlyMap<string, Paint>): void {
  assertRoom(rect, chart.width, chart.height);
  const units = chart.series[0]!;
  const starts = startsOf(units.counts);
  const { unit, names } = drawerOf(drawing, units, rect, paintOf, chart);
  units.data.forEach((item, i) => {
    const count = units.counts[i]!;
    const nodes = Array.from({ length: count }, (_, k) => unit(i, k, starts[i]! + k));
    const name = names?.[i];
    if (count === 0 && name === undefined) return;
    const share = units.units === undefined ? '' : `, ${count} of ${units.units} units`;
    drawing.mark(`${valueLabel(item)}${share}`, name === undefined ? nodes : [name, ...nodes]);
  });
}

/**
 * Draws the `k`th unit of a category, the `index`th of the series; and for pictogram rows, the name
 * beside each category's row.
 */
function drawerOf(drawing: Drawing, units: Units, rect: Rect, paintOf: ReadonlyMap<string, Paint>, chart: CheckedUnitsChart) {
  const style = (category: number) => solid(paintOf.get(units.data[category]!.name)!.color);
  const key = (index: number) => [units.name, 'unit', index];
  const marker = (place: Place) => (category: number, k: number, index: number): ChartNode => {
    const { center, size } = place(category, k, index);
    return markerNode(drawing, unitSymbol(units.display, units.data[category]!.symbol), center, size, style(category), key(index), units.style);
  };
  const total = units.counts.reduce((sum, count) => sum + count, 0);
  switch (units.display) {
    case 'waffle': {
      const columns = units.columns ?? 10;
      return { unit: marker(grid(rect, columns, Math.ceil(total / columns), chart)), names: undefined };
    }
    case 'parliament':
      return { unit: marker(parliament(units, rect, chart)), names: undefined };
    case 'rows': {
      const rows = pictogramRows(drawing, units, rect, chart);
      return { unit: marker(rows.place), names: rows.names };
    }
    case 'ring': {
      const { startAngle, endAngle, innerRadius, padAngle } = units;
      const { center, radius } = fitSweep(rect, startAngle, endAngle, innerRadius);
      const step = (endAngle - startAngle) / total;
      const pad = total > 1 ? padAngle / 2 : 0;
      // A segment is as deep as the ring and, at its middle, as long as its sweep less the gaps.
      assertUnitRoom(Math.min(radius * (1 - innerRadius), radius * ((1 + innerRadius) / 2) * (step - 2 * pad) * RADIANS), chart);
      const unit = (category: number, _k: number, index: number): ChartNode => {
        const from = startAngle + index * step;
        const shape = sliceShape(center, radius, radius * innerRadius, from + pad, from + step - pad);
        return drawing.shape(shape, style(category), key(index), units.style);
      };
      return { unit, names: undefined };
    }
    default:
      return unhandled(units.display);
  }
}

/** Fails, as a chart with no room does, where a unit would be less than one unit of the drawing wide. */
function assertUnitRoom(size: number, chart: CheckedUnitsChart): void {
  assertRoom({ left: 0, top: 0, right: size, bottom: size }, chart.width, chart.height);
}

/** A grid of `columns` by `lines` square cells, centred in `rect`, filled row by row. */
function grid(rect: Rect, columns: number, lines: number, chart: CheckedUnitsChart): Place {
  const cell = Math.min((rect.right - rect.left) / columns, (rect.bottom - rect.top) / lines);
  assertUnitRoom(cell, chart);
  const left = (rect.left + rect.right - cell * columns) / 2;
  const top = (rect.top + rect.bottom - cell * lines) / 2;
  return (_category, _k, index) => ({
    center: [left + ((index % columns) + 0.5) * cell, top + (Math.floor(index / columns) + 0.5) * cell],
    size: cell * FILL,
  });
}

/**
 * Seats on rows of arcs between the hole and the rim, filled by angle, so that each category takes a
 * wedge from the start of the sweep.
 */
function parliament(units: Units, rect: Rect, chart: CheckedUnitsChart): Place {
  const { startAngle, endAngle, innerRadius, seating } = units;
  const { center, radius } = fitSweep(rect, startAngle, endAngle, innerRadius);
  const sweep = endAngle - startAngle;
  const spots = seating.rows
    .flatMap(({ reach, seats }) => Array.from({ length: seats }, (_, i) => ({ angle: startAngle + ((i + 0.5) * sweep) / seats, reach })))
    .sort((a, b) => a.angle - b.angle || a.reach - b.reach);
  const seat = radius * seating.size;
  assertUnitRoom(seat, chart);
  const size = seat * FILL;
  return (_category, _k, index) => {
    const { angle, reach } = spots[index]!;
    const [dx, dy] = onCircle(angle);
    return { center: [center[0] + radius * reach * dx, center[1] + radius * reach * dy], size };
  };
}

/**
 * One category to a row of pictograms, wrapping after `columns` units, each row's name beside it on
 * the left; a category with no units keeps an empty row.
 */
function pictogramRows(drawing: Drawing, units: Units, rect: Rect, chart: CheckedUnitsChart) {
  const columns = units.columns ?? Math.max(1, ...units.counts);
  const lines = units.counts.map((count) => Math.max(1, Math.ceil(count / columns)));
  const firsts = startsOf(lines);
  const total = firsts.at(-1)! + lines.at(-1)!;
  const widest = Math.max(...units.data.map((item) => drawing.width(item.name)));
  const room = Math.min(widest, (rect.right - rect.left) * NAME_SHARE);
  const left = rect.left + room + GAP;
  const cell = Math.min((rect.right - left) / columns, (rect.bottom - rect.top) / total);
  assertUnitRoom(cell, chart);
  const top = (rect.top + rect.bottom - cell * total) / 2;
  const place: Place = (category, k) => ({
    center: [left + ((k % columns) + 0.5) * cell, top + (firsts[category]! + Math.floor(k / columns) + 0.5) * cell],
    size: cell * FILL,
  });
  const names = units.data.map((item, i) => drawing.text(drawing.fit(item.name, room, `${units.path}.data[${i}].name`),
    { x: rect.left + room, y: top + (firsts[i]! + 0.5) * cell, anchor: 'end', baseline: 'middle' }));
  return { place, names };
}
