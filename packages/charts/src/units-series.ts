// A unit chart: each category's value as a count of equal units, in a waffle grid, the seats of a
// parliament, rows of pictograms, or the segments of a ring.
import { checkSweep, MAX_HOLE } from './check-axis.js';
import { RADIANS } from './geometry.js';
import { readNamedValues } from './named-values.js';
import { fail, integer, number, type Fields } from './read.js';
import { readDisplay, type Choices } from './statistics/types.js';
import { checkMarker } from './symbols.js';
import type { Marker, SeriesBase } from './types.js';
import type { CheckedChartBase, SeriesOf } from './validate.js';

/** The most units a chart draws, every series together. */
export const MAX_UNITS = 2000;
/** The most rows of seats a parliament has. */
const MAX_SEAT_ROWS = 50;
const MAX_PAD_ANGLE = 10;

interface UnitsOptions {
  /**
   * The number of units the values share, 1 to 2,000, given out by largest remainder. Without it, each
   * value is a whole number of units.
   */
  units?: number | undefined;
  /**
   * Units in each row, 1 to 200. A waffle defaults to 10; pictogram rows to the most units of any
   * category, so each category has one row.
   */
  columns?: number | undefined;
  /** In degrees clockwise from the top. A parliament defaults to -90, a ring to 0. */
  startAngle?: number | undefined;
  /** In degrees clockwise from the top, after `startAngle`. A parliament defaults to 90, a ring to 360. */
  endAngle?: number | undefined;
  /** The empty middle, as a share of the radius: 0 to 0.95. A parliament defaults to 0.4, a ring to 0.7. */
  innerRadius?: number | undefined;
  /** A parliament's rows of seats, 1 to 50. Defaults to the fewest that seat every unit. */
  rows?: number | undefined;
  /** The gap between a ring's segments, in degrees: 0 to 10. Defaults to 2. */
  padAngle?: number | undefined;
}

/** The options each display takes. */
export const UNITS_DISPLAYS = {
  waffle: ['units', 'columns'],
  parliament: ['units', 'startAngle', 'endAngle', 'innerRadius', 'rows'],
  rows: ['units', 'columns'],
  ring: ['units', 'startAngle', 'endAngle', 'innerRadius', 'padAngle'],
} as const satisfies Record<string, readonly (keyof UnitsOptions)[]>;

export interface UnitsDatum {
  /** At most 100 characters, unique in the series: the category's legend entry. */
  name: string;
  /** 0 to 1e15: a whole number of units, or a share of the series' `units`. */
  value: number;
  color?: string | undefined;
  /**
   * What each of the category's units is drawn as: a symbol or a named image. Defaults to a square in
   * a waffle and a circle otherwise. A ring draws segments, so it takes none.
   */
  symbol?: Marker | undefined;
}

/**
 * Each category's value as a number of equal units. `display` picks the layout: a `waffle` grid, the
 * seats of a `parliament` on rows of arcs, `rows` of pictograms, one category to a row, or a `ring` of
 * segments, as a segmented doughnut is.
 */
export type UnitsSeries = SeriesBase & { type: 'units'; data: readonly UnitsDatum[] } & Choices<
    'display',
    UnitsOptions,
    typeof UNITS_DISPLAYS
  >;

export interface CheckedUnitsChart extends CheckedChartBase {
  system: 'units';
  series: SeriesOf<'units'>[];
}

export function readUnits(r: Fields, path: string, reserve: (count: number) => void) {
  const display = readDisplay(r, UNITS_DISPLAYS);
  const ring = display === 'ring';
  const data = readNamedValues(r, path, reserve, ring ? [] : ['symbol'], (item) => ({
    symbol: ring ? undefined : item.optional('symbol', checkMarker),
  }));
  const shared = r.optional('units', integer(1, MAX_UNITS));
  const counts = shared === undefined ? wholeCounts(data, path) : allot(data, shared, path);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total > MAX_UNITS) {
    fail(`${path}.data`, `has ${total} units, more than the ${MAX_UNITS} a chart draws: give units to share the values out`);
  }
  reserve(total);
  const columns = r.optional('columns', integer(1, 200));
  const round = display === 'parliament' || ring;
  const { startAngle, endAngle } = round ? checkSweep(r, path, ring ? [0, 360] : [-90, 90]) : { startAngle: 0, endAngle: 0 };
  const innerRadius = r.optional('innerRadius', number(0, MAX_HOLE)) ?? (ring ? 0.7 : 0.4);
  const padAngle = r.optional('padAngle', number(0, MAX_PAD_ANGLE)) ?? 2;
  if (ring && total > 1 && !((endAngle - startAngle) / total > padAngle)) {
    fail(`${path}.padAngle`, `is ${padAngle}, which leaves no room for ${total} segments in ${endAngle - startAngle} degrees`);
  }
  const rows = r.optional('rows', integer(1, MAX_SEAT_ROWS));
  const seating = display === 'parliament' ? seatRows(total, endAngle - startAngle, innerRadius, rows) : { rows: [], size: 0 };
  if (seating === undefined) {
    fail(`${path}.data`, `has ${total} units, more than ${MAX_SEAT_ROWS} rows over ${endAngle - startAngle} degrees can seat`);
  }
  return { display, data, counts, units: shared, columns, startAngle, endAngle, innerRadius, padAngle, seating };
}

/** What a category's units are drawn as: its symbol, by default a square in a waffle and a circle otherwise. */
export function unitSymbol(display: keyof typeof UNITS_DISPLAYS, symbol: Marker | undefined): Marker {
  return symbol ?? (display === 'waffle' ? 'square' : 'circle');
}

export function checkUnitsChart(r: Fields, base: CheckedChartBase, series: SeriesOf<'units'>[]): CheckedUnitsChart {
  if (r.has('axes')) fail('axes', 'must be left out: a unit chart has no axes');
  if (series.length > 1) fail('series', `of a unit chart must be one units series, got ${series.length}`);
  return { ...base, system: 'units', series };
}

/** Each value as a count of units, where each must be a whole number. */
function wholeCounts(data: readonly { value: number }[], path: string): number[] {
  return data.map(({ value }, i) =>
    Number.isInteger(value) ? value : fail(`${path}.data[${i}].value`, `is ${value}, not a whole number of units: give units to share the values out`));
}

/**
 * `units` given out in proportion to the values. A value above 0 that would get no unit is an error,
 * so no category is drawn as nothing.
 */
function allot(data: readonly { value: number }[], units: number, path: string): number[] {
  const counts = largestRemainder(data.map(({ value }) => value), units);
  counts.forEach((count, i) => {
    if (count === 0 && data[i]!.value > 0) {
      fail(`${path}.data[${i}].value`, `is ${data[i]!.value}, too small a share to get one of the ${units} units`);
    }
  });
  return counts;
}

/**
 * `total` shared out in proportion to `weights` by largest remainder: each takes the whole part of its
 * exact share, and what is left goes one at a time to the largest fractions, a tie to the earlier.
 */
function largestRemainder(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((all, weight) => all + weight, 0);
  const exact = weights.map((weight) => (weight / sum) * total);
  const counts = exact.map(Math.floor);
  const left = total - counts.reduce((all, count) => all + count, 0);
  exact.map((share, i) => ({ i, rest: share - counts[i]! }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i)
    .slice(0, left)
    .forEach(({ i }) => {
      counts[i]! += 1;
    });
  return counts;
}

/** A row of a parliament: the radius of its middle, as a share of the parliament's, and its seats. */
interface SeatRow {
  reach: number;
  seats: number;
}

/**
 * A parliament's rows, innermost first, the seats shared in proportion to their lengths, and the size
 * of a seat: as deep as a row, but no wider than the most crowded row leaves each, as a share of the
 * radius. The rows fill the ring between the hole and the rim of a circle of radius 1: `rows` of
 * them, or else the fewest in which seats as deep as a row all fit. Undefined when 50 such rows do not.
 */
function seatRows(count: number, sweep: number, hole: number, rows?: number): { rows: SeatRow[]; size: number } | undefined {
  const k = rows ?? Array.from({ length: MAX_SEAT_ROWS }, (_, i) => i + 1).find((tried) =>
    rowReaches(tried, hole).reduce((seats, reach) => seats + Math.floor((sweep * RADIANS * reach * tried) / (1 - hole)), 0) >= count);
  if (k === undefined) return undefined;
  const reaches = rowReaches(k, hole);
  const seats = largestRemainder(reaches, count);
  const crowded = Math.min(...seats.map((n, row) => (n === 0 ? Infinity : (sweep * RADIANS * reaches[row]!) / n)));
  return { rows: reaches.map((reach, row) => ({ reach, seats: seats[row]! })), size: Math.min((1 - hole) / k, crowded) };
}

/** The radius of the middle of each of `rows` rows between the hole and the rim, innermost first. */
function rowReaches(rows: number, hole: number): number[] {
  return Array.from({ length: rows }, (_, j) => hole + ((j + 0.5) * (1 - hole)) / rows);
}
