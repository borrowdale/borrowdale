// Reading the series whose cells and rows sit on a chart's axes: heatmaps, polar heatmaps and
// horizons. Each is read in two steps, as an xRange is: its own fields first, then its places, once
// the axes they are read against are known.
import {
  anyValue,
  categoryOf,
  MAX_NAME,
  readerOn,
  type CheckedAxis,
  type CheckedBandAxis,
  type CheckedLinearAxis,
} from './check-axis.js';
import {
  coordinates,
  fail,
  integer,
  list,
  MAX_POINTS,
  nullable,
  oneOf,
  readEach,
  shortText,
  show,
  uniqueBy,
  type Check,
  type Fields,
} from './read.js';
import { writtenOn } from './time.js';
import type { SeriesOf } from './validate.js';

// The farthest a hex heatmap's column or row may be from 0.
const MAX_HEX_PLACE = 100_000;
// A horizon's layers.
const MIN_HORIZON_BANDS = 2;
const MAX_HORIZON_BANDS = 6;

/** A cell's place on one axis as the spec gives it: a category, a number, or a `[from, to]` stretch. */
type GivenPlace = string | number | [number, number];

/** A cell's place on one axis, once its axis is known: a category's index, or a stretch of values. */
export type CheckedPlace = { band: number } | { from: number; to: number };

/**
 * A cell, with its places read once the axes are known (`resolveCells`, `resolvePolarCells`). On a
 * polar chart, `x` is its place on the angle axis and `y` on the radius axis.
 */
export interface CheckedCell {
  given: [GivenPlace, GivenPlace];
  x: CheckedPlace;
  y: CheckedPlace;
  value: number | null;
}

const UNPLACED: CheckedPlace = { band: -1 };

/** The category index of a place on a band axis, as a polar heatmap's places always are. */
export function categoryIndex(place: CheckedPlace): number {
  if (!('band' in place)) throw new Error('A place on a band axis is a category');
  return place.band;
}
// An entry of a list, copied as it is, to be read by its position.
const anyItem: Check<unknown> = (_path, item) => item;

const givenPlace: Check<GivenPlace> = (path, raw) => {
  if (typeof raw === 'string') return shortText(MAX_NAME)(path, raw);
  if (typeof raw === 'number') return anyValue(path, raw);
  const [from, to] = coordinates(['from', 'to'])(path, raw);
  return [from, to];
};

const checkCell: Check<CheckedCell> = (path, raw) => {
  const [x, y, value] = list(3, 3, anyItem)(path, raw);
  return {
    given: [givenPlace(`${path}[0]`, x), givenPlace(`${path}[1]`, y)],
    x: UNPLACED,
    y: UNPLACED,
    value: nullable(anyValue)(`${path}[2]`, value),
  };
};

const readCells = (r: Fields, reserve: (count: number) => void) => r.required('data', list(0, MAX_POINTS, checkCell, reserve));

export function readHeatmap(r: Fields, _path: string, reserve: (count: number) => void) {
  return {
    display: r.optional('display', oneOf(['rect', 'circle', 'hex', 'correlation'] as const)) ?? 'rect',
    data: readCells(r, reserve),
  };
}

export function readPolarHeatmap(r: Fields, _path: string, reserve: (count: number) => void) {
  return {
    display: r.optional('display', oneOf(['sector', 'polygon'] as const)) ?? 'sector',
    data: readCells(r, reserve),
  };
}

/** Each cell's place on each axis, and no two cells in one place. */
export function resolveCells(entry: Extract<SeriesOf<'cartesian'>, { type: 'heatmap' }>, axes: { x: CheckedAxis; y: CheckedAxis }): void {
  const hex = entry.display === 'hex';
  const linear = (axis: CheckedAxis) => axis.type === 'linear' && axis.kind === 'linear';
  if (hex && !(linear(axes.x) && linear(axes.y))) {
    fail(entry.path, 'is a hex heatmap, which needs linear x and y axes');
  }
  entry.data.forEach((cell, i) => {
    const path = `${entry.path}.data[${i}]`;
    if (hex) {
      const [column, row] = cell.given.map((place, k) => integer(-MAX_HEX_PLACE, MAX_HEX_PLACE)(`${path}[${k}]`, place)) as [number, number];
      cell.x = { from: 0.75 * column - 0.5, to: 0.75 * column + 0.5 };
      cell.y = { from: row + column / 2 - 0.5, to: row + column / 2 + 0.5 };
    } else {
      cell.x = placeOn(axes.x, cell.given[0], `${path}[0]`);
      cell.y = placeOn(axes.y, cell.given[1], `${path}[1]`);
    }
    if (entry.display === 'correlation' && cell.value !== null && !(cell.value >= -1 && cell.value <= 1)) {
      fail(`${path}[2]`, `must be a coefficient from -1 to 1, got ${cell.value}`);
    }
  });
  oneValuePerCell(entry.data, entry.path);
}

/** Each polar cell's category on the angle and radius axes, and no two cells in one place. */
export function resolvePolarCells(entry: Extract<SeriesOf<'polar'>, { type: 'polarHeatmap' }>, angle: CheckedBandAxis, radius: CheckedBandAxis): void {
  entry.data.forEach((cell, i) => {
    cell.x = placeOn(angle, cell.given[0], `${entry.path}.data[${i}][0]`);
    cell.y = placeOn(radius, cell.given[1], `${entry.path}.data[${i}][1]`);
  });
  oneValuePerCell(entry.data, entry.path);
}

function oneValuePerCell(cells: readonly CheckedCell[], path: string): void {
  uniqueBy(cells, (cell) => JSON.stringify([cell.x, cell.y]),
    (i, first) => fail(`${path}.data[${i}]`, `is a second value for the cell of ${path}.data[${first}]`));
}

// A cell's place on `axis`: one of its categories, or a stretch read by it.
function placeOn(axis: CheckedAxis, given: GivenPlace, path: string): CheckedPlace {
  if (axis.type === 'band') {
    return { band: categoryOf(axis, given, path) };
  }
  if (!Array.isArray(given)) fail(path, `must be a [from, to] stretch of ${axis.path}, got ${show(given)}`);
  const value = readerOn(axis);
  const [from, to] = [value(`${path}[0]`, given[0]), value(`${path}[1]`, given[1])];
  if (!(to > from)) fail(`${path}[1]`, `must be after ${writtenOn(axis.kind, from)}, got ${writtenOn(axis.kind, to)}`);
  return { from, to };
}

export function readHorizon(r: Fields, _path: string, reserve: (count: number) => void) {
  return {
    // Matched to a category once the axes are known (resolveHorizon).
    row: r.required('row', shortText(MAX_NAME)),
    category: -1,
    data: r.required('data', list(0, MAX_POINTS, nullable(coordinates(['x', 'value'])), reserve)),
    bands: r.optional('bands', integer(MIN_HORIZON_BANDS, MAX_HORIZON_BANDS)) ?? 3,
    mode: r.optional('mode', oneOf(['mirror', 'offset'] as const)) ?? 'mirror',
  };
}

/** A horizon's row among the band axis' categories, and its points read by the x axis, x increasing. */
export function resolveHorizon(entry: Extract<SeriesOf<'cartesian'>, { type: 'horizon' }>, axis: CheckedLinearAxis, band: CheckedBandAxis): void {
  // Its layers are stretched along x in proportion, so x is linear or time.
  if (axis.kind !== 'linear' && axis.kind !== 'time') {
    fail(entry.path, `is a horizon series on ${axis.path}, a ${axis.kind} axis, but needs a linear or time x axis`);
  }
  entry.category = categoryOf(band, entry.row, `${entry.path}.row`);
  readEach(entry.data, `${entry.path}.data`, [readerOn(axis), anyValue]);
  // Across gaps too: the runs of one row never fold back over each other.
  entry.data.reduce<number | undefined>((previous, point, i) => {
    if (point === null) return previous;
    if (previous !== undefined && point[0] <= previous) fail(`${entry.path}.data[${i}][0]`, 'must increase, across gaps too');
    return point[0];
  }, undefined);
}
