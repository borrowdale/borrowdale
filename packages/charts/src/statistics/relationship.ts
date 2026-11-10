import { log } from '@borrowdale/core/math';
import { fail, integer, list, MAX_VALUE, number, tuple, type Fields } from '../read.js';
import { binGrid } from './bin-grid.js';
import {
  average,
  checkGeometry,
  dot,
  exp,
  grid,
  line,
  rect,
  valued,
  type Glyph,
  type XY,
} from './geometry.js';
import { keyOf, readDisplay, REGRESSIONS, RELATIONSHIPS, unhandled, type RegressionMethod } from './types.js';

// A least-squares polynomial in centred, scaled coordinates, by orthogonalising the Vandermonde
// columns.
function polynomial(data: XY[], degree: number, path: string): (x: number) => number {
  const xs = data.map(([x]) => x);
  const low = Math.min(...xs), high = Math.max(...xs);
  if (low === high || new Set(xs).size <= degree) {
    fail(path, 'needs more distinct x values than the polynomial degree');
  }
  const scale = (x: number) => ((x - low) / (high - low)) * 2 - 1;
  if (degree === 1) {
    const scaled = xs.map(scale);
    const centre = average(scaled);
    const mean = average(data.map((point) => point[1]));
    const offsets = scaled.map((value) => value - centre);
    const covariance = average(offsets.map((offset, i) => offset * (data[i]![1] - mean)));
    const variance = average(offsets.map((offset) => offset * offset));
    const slope = covariance / variance;
    return (x) => mean + (scale(x) - centre) * slope;
  }
  const columns: number[][] = [];
  const triangular: number[][] = [];
  const coefficients: number[] = [];
  for (let k = 0; k <= degree; k++) {
    const v = xs.map((x) => {
      const base = scale(x);
      let power = 1;
      for (let i = 0; i < k; i++) power *= base;
      return power;
    });
    const projections: number[] = [];
    for (const q of columns) {
      const projection = v.reduce((sum, t, i) => sum + t * q[i]!, 0);
      projections.push(projection);
      q.forEach((t, i) => {
        v[i]! -= projection * t;
      });
    }
    const norm = Math.sqrt(v.reduce((sum, t) => sum + t * t, 0));
    if (norm < 1e-12) fail(path, 'has a numerically singular fit');
    const q = v.map((t) => t / norm);
    columns.push(q);
    triangular.push([...projections, norm]);
    coefficients.push(data.reduce((sum, p, i) => sum + p[1] * q[i]!, 0));
  }
  for (let k = degree; k >= 0; k--) {
    coefficients[k]! /= triangular[k]![k]!;
    for (let j = 0; j < k; j++) coefficients[j]! -= triangular[k]![j]! * coefficients[k]!;
  }
  return (x) => coefficients.reduceRight((sum, c) => sum * scale(x) + c, 0);
}

function loess(data: readonly (readonly [number, number])[], x: number, count: number): number {
  const neighbours = data
    .map(([u, y]) => ({ dx: u - x, y }))
    .sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx))
    .slice(0, count);
  const radius = Math.abs(neighbours.at(-1)!.dx);
  let w = 0, dx = 0, y = 0, xx = 0, xy = 0;
  for (const point of neighbours) {
    const offset = radius ? point.dx / radius : 0;
    const u = Math.abs(offset);
    const taper = 1 - u * u * u;
    const weight = taper * taper * taper;
    w += weight;
    dx += weight * offset;
    y += weight * point.y;
    xx += weight * offset * offset;
    xy += weight * offset * point.y;
  }
  if (!w) return neighbours.reduce((s, p) => s + p.y, 0) / neighbours.length;
  const det = w * xx - dx * dx;
  return det > 1e-14 * w * xx ? (xx * y - dx * xy) / det : y / w;
}

// How each method shapes the observations before a straight-line, polynomial or local fit.
const SHAPES: Record<RegressionMethod, { logX: boolean; logY: boolean }> = {
  linear: { logX: false, logY: false },
  polynomial: { logX: false, logY: false },
  exponential: { logX: false, logY: true },
  logarithmic: { logX: true, logY: false },
  loess: { logX: false, logY: false },
};

// The largest power of two at or below a positive value: dividing by it is exact.
function binaryScale(value: number): number {
  let scale = 1;
  while (scale > value) scale /= 2;
  while (scale * 2 <= value) scale *= 2;
  return scale;
}

function regression(r: Fields, path: string, data: readonly (readonly [number, number])[]): Glyph {
  const method = r.optional('method', keyOf(REGRESSIONS)) ?? 'linear';
  // Each option belongs to the method that lists it.
  for (const [owner, options] of Object.entries(REGRESSIONS)) {
    for (const option of options) {
      if (owner !== method && r.has(option)) fail(`${path}.${option}`, `needs the ${owner} method`);
    }
  }
  const degree = method === 'polynomial' ? (r.optional('degree', integer(1, 5)) ?? 2) : 1;
  const span = r.optional('span', number(0.05, 1)) ?? 0.5;
  const { logX, logY } = SHAPES[method];
  const transformed: XY[] = data.map(([x, y], i) => {
    if ((logX && x <= 0) || (logY && y <= 0)) fail(`${path}.data[${i}]`, 'needs a positive value for the logarithm');
    return [logX ? log(x) : x, logY ? log(y) : y];
  });
  // Responses are fitted as offsets from the first, divided by a power of two near their spread, so
  // responses at any magnitude, subnormal ones included, keep their precision through the fit.
  const responses = transformed.map((point) => point[1]);
  const origin = responses[0]!;
  const minT = Math.min(...responses), maxT = Math.max(...responses);
  const spread = Math.max(maxT - origin, origin - minT);
  const scale = spread ? binaryScale(spread) : 1;
  for (const point of transformed) point[1] = (point[1] - origin) / scale;
  const xs = data.map((p) => p[0]);
  const low = Math.min(...xs), high = Math.max(...xs);
  if (low === high) fail(path, 'needs distinct x values');
  if (logX && new Set(transformed.map(([x]) => x)).size < 2) fail(path, 'needs x values whose logarithms differ');
  // LOESS needs three observations; with two it is their straight line.
  const fit =
    method === 'loess' && data.length > 2
      ? (x: number) => loess(transformed, x, Math.max(3, Math.ceil(data.length * span)))
      : polynomial(transformed, degree, path);
  const ys = data.map((point) => point[1]);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  // A fit that reaches the observed extent can pass it by a few rounding units, in the fitted
  // response and, for exponential fits, in the exponential. It is kept at the extent. A larger
  // overshoot belongs to the fit and is drawn as calculated.
  const tolerance =
    4 * Number.EPSILON * (maxT - minT + Math.max(Math.abs(minT), Math.abs(maxT))) + (logY ? 4 * Number.EPSILON : 0);
  return line(
    method,
    grid(low, high).map((x) => {
      const t = origin + fit(logX ? log(x) : x) * scale;
      const y = logY ? exp(t) : t;
      if (y > maxY && t <= maxT + tolerance) return [x, maxY];
      if (y < minY && t >= minT - tolerance) return [x, minY];
      return [x, y];
    }),
  );
}

/** How observations fall into cells, and the outline of each cell. */
interface CellLayout {
  /** The column and row of the cell holding the point. */
  cell(x: number, y: number): [number, number];
  shape(column: number, row: number, label: string): Glyph;
}

function binSize(r: Fields): [number, number] {
  const width = r.optional('binWidth', number(Number.MIN_VALUE, MAX_VALUE)) ?? 1;
  return [width, r.optional('binHeight', number(Number.MIN_VALUE, MAX_VALUE)) ?? width];
}

// Rectangles on exact decimal grids from zero.
function rectangles(path: string, [width, height]: [number, number]): CellLayout {
  const columns = binGrid(0, width), rows = binGrid(0, height);
  return {
    cell: (x, y) => [columns.index(x, 'floor'), rows.index(y, 'floor')],
    shape: (column, row, label) => {
      const left = columns.edge(column);
      const right = columns.edge(column + 1);
      const bottom = rows.edge(row);
      const top = rows.edge(row + 1);
      if (left === right || bottom === top) fail(path, 'needs distinct bin edges at the data coordinates');
      return rect(label, left, bottom, right, top);
    },
  };
}

// Flat-top hexagons in axial coordinates, rounded in three cube axes.
function hexagons(path: string, [width, height]: [number, number]): CellLayout {
  return {
    cell: (x, y) => {
      const q = (2 * x) / (3 * width), s = y / (Math.sqrt(3) * height) - q / 2, t = -q - s;
      let column = Math.round(q), row = Math.round(s);
      const third = Math.round(t);
      if (Math.abs(column - q) > Math.abs(row - s) && Math.abs(column - q) > Math.abs(third - t)) column = -row - third;
      else if (Math.abs(row - s) > Math.abs(third - t)) row = -column - third;
      return [column, row];
    },
    shape: (column, row, label) => {
      const cx = 1.5 * width * column;
      const cy = Math.sqrt(3) * height * (row + column / 2);
      const half = (Math.sqrt(3) * height) / 2;
      if (cx - width / 2 === cx + width / 2 || cy - half === cy + half) {
        fail(path, 'needs distinct hexagon vertices at the data coordinates');
      }
      return {
        kind: 'polygon',
        label,
        points: [
          [cx + width, cy],
          [cx + width / 2, cy + half],
          [cx - width / 2, cy + half],
          [cx - width, cy],
          [cx - width / 2, cy - half],
          [cx + width / 2, cy - half],
        ],
      };
    },
  };
}

// One cell per occupied bin, hatched more densely the more observations it holds.
function countCells(path: string, layout: CellLayout, data: readonly (readonly [number, number])[]): Glyph[] {
  const cells = new Map<string, { column: number; row: number; count: number }>();
  for (const [x, y] of data) {
    const [column, row] = layout.cell(x, y);
    if (![column, row, column + 1, row + 1].every(Number.isSafeInteger)) {
      fail(path, 'needs bin dimensions resolvable at the data coordinates');
    }
    const key = `${column},${row}`;
    const cell = cells.get(key) ?? { column, row, count: 0 };
    cell.count++;
    cells.set(key, cell);
  }
  const peak = Math.max(...Array.from(cells.values(), (c) => c.count));
  return Array.from(cells.values(), ({ column, row, count }): Glyph => ({
    ...layout.shape(column, row, String(count)),
    role: 'count',
    weight: count / peak,
  }));
}

// A Stanford diagram's region boundaries: where the error equals the protection level, and the
// alert limit on each axis.
function stanfordBoundaries(limit: number, data: readonly (readonly [number, number])[]): Glyph[] {
  const max = Math.max(limit, ...data.flat());
  return [
    line('Error equals protection level', [[0, 0], [max, max]], 'reference'),
    line('Alert limit', [[0, limit], [max, limit]], 'reference'),
    line('Error at alert limit', [[limit, 0], [limit, max]], 'reference'),
  ];
}

export function readRelationship(r: Fields, path: string, reserve: (count: number) => void) {
  const display = readDisplay(r, RELATIONSHIPS);
  const data = r.required('data', list(1, 1000, tuple(['x', 'y']), reserve));
  const marks: Glyph[] = [];
  switch (display) {
    case 'regression':
      marks.push(regression(r, path, data));
      break;
    case 'qq': {
      const x = data.map((p) => p[0]).sort((a, b) => a - b);
      const y = data.map((p) => p[1]).sort((a, b) => a - b);
      x.forEach((v, i) => marks.push(dot(`Quantile ${(i + 0.5) / x.length}`, v, y[i]!)));
      break;
    }
    case 'forest': {
      const estimates = r.required('estimates', list(data.length, data.length, number(-MAX_VALUE, MAX_VALUE)));
      data.forEach(([low, high], i) => {
        const estimate = estimates[i]!;
        if (low > high || estimate < low || estimate > high) {
          fail(`${path}.data[${i}]`, 'needs an ordered interval containing its estimate');
        }
        marks.push(
          { ...valued(line('Interval {0} to {1}', [[low, i], [high, i]]), [low, high]), along: 'x' },
          { ...valued(dot('{0}', estimate, i), [estimate]), along: 'x' },
        );
      });
      break;
    }
    case 'histogram2d':
    case 'hexbin':
      marks.push(...countCells(path, (display === 'hexbin' ? hexagons : rectangles)(path, binSize(r)), data));
      break;
    case 'stanford': {
      if (data.some(([x, y]) => x < 0 || y < 0)) fail(path, 'needs nonnegative errors and protection levels');
      const limit = r.required('alertLimit', number(Number.MIN_VALUE, MAX_VALUE));
      marks.push(...countCells(path, rectangles(path, binSize(r)), data), ...stanfordBoundaries(limit, data));
      break;
    }
    default:
      unhandled(display);
  }
  return checkGeometry(path, marks, reserve);
}
