import { binGrid } from './bin-grid.js';
import { log } from '@borrowdale/core/math';
import { fail, integer, list, MAX_VALUE, number, oneOf, tuple, type Fields } from '../read.js';
import { average, checkGeometry, dot, exp, grid, line, rect, type Glyph, type XY } from './geometry.js';
import { readDisplay, RELATIONSHIPS } from './types.js';

// Fit in centred, scaled coordinates by orthogonalising the Vandermonde columns.
function polynomial(data: XY[], degree: number, path: string): (x: number) => number {
  const xs = data.map(([x]) => x);
  const low = Math.min(...xs),
    high = Math.max(...xs);
  if (low === high || new Set(xs).size <= degree)
    fail(path, 'needs more distinct x values than the polynomial degree');
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
  let w = 0,
    dx = 0,
    y = 0,
    xx = 0,
    xy = 0;
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
export function readRelationship(r: Fields, path: string, reserve: (n: number) => void) {
  const display = readDisplay(r, RELATIONSHIPS);
  const data = r.required('data', list(1, 1000, tuple(['x', 'y']), reserve));
  const marks: Glyph[] = [];
  if (display === 'regression') {
    const method =
      r.optional('method', oneOf(['linear', 'polynomial', 'exponential', 'logarithmic', 'loess'] as const)) ??
      'linear';
    if (method !== 'loess' && r.has('span')) fail(`${path}.span`, 'needs the loess method');
    if (method !== 'polynomial' && r.has('degree')) fail(`${path}.degree`, 'needs the polynomial method');
    const degree = r.optional('degree', integer(1, 5)) ?? 2;
    const span = r.optional('span', number(0.05, 1)) ?? 0.5;
    const transformed: XY[] = data.map(([x, y], i) => {
      if ((method === 'logarithmic' && x <= 0) || (method === 'exponential' && y <= 0))
        fail(`${path}.data[${i}]`, 'needs a positive value for the logarithm');
      return [method === 'logarithmic' ? log(x) : x, method === 'exponential' ? log(y) : y];
    });
    const origin = transformed[0]![1];
    for (const point of transformed) point[1] -= origin;
    const xs = data.map((p) => p[0]);
    const low = Math.min(...xs),
      high = Math.max(...xs);
    if (low === high) fail(path, 'needs distinct x values');
    const fit =
      method === 'loess' && data.length > 2
        ? (x: number) => loess(transformed, x, Math.max(3, Math.ceil(data.length * span)))
        : polynomial(transformed, method === 'polynomial' ? degree : 1, path);
    const ys = data.map((point) => point[1]);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const fitTolerance = 4 * Number.EPSILON * (maxY - minY);
    marks.push(
      line(
        method,
        grid(low, high).map((x) => {
          const y = origin + fit(method === 'logarithmic' ? log(x) : x);
          if (method === 'linear' || (method === 'polynomial' && degree === 1)) {
            // A fitted endpoint can exceed the observed extent by a few rounding units.
            if (y < minY && minY - y <= fitTolerance) return [x, minY];
            if (y > maxY && y - maxY <= fitTolerance) return [x, maxY];
          }
          return [x, method === 'exponential' ? exp(y) : y];
        }),
      ),
    );
  } else if (display === 'qq') {
    const x = data.map((p) => p[0]).sort((a, b) => a - b);
    const y = data.map((p) => p[1]).sort((a, b) => a - b);
    x.forEach((v, i) => marks.push(dot(`Quantile ${(i + 0.5) / x.length}`, v, y[i]!)));
  } else if (display === 'forest') {
    const estimates = r.required('estimates', list(data.length, data.length, number(-MAX_VALUE, MAX_VALUE)));
    data.forEach(([lo, hi], i) => {
      if (lo > hi || estimates[i]! < lo || estimates[i]! > hi)
        fail(`${path}.data[${i}]`, 'needs an ordered interval containing its estimate');
      marks.push(
        line(`Interval ${lo} to ${hi}`, [
          [lo, i],
          [hi, i],
        ]),
        dot(String(estimates[i]), estimates[i]!, i),
      );
    });
  } else {
    const width = r.optional('binWidth', number(Number.MIN_VALUE, MAX_VALUE)) ?? 1;
    const height = r.optional('binHeight', number(Number.MIN_VALUE, MAX_VALUE)) ?? width;
    const columns = binGrid(0, width),
      rows = binGrid(0, height);
    const cells = new Map<string, { x: number; y: number; count: number }>();
    for (const [x, y] of data) {
      let col: number, row: number;
      if (display === 'hexbin') {
        // Flat-top axial coordinates, rounded in three cube axes.
        const q = (2 * x) / (3 * width),
          s = y / (Math.sqrt(3) * height) - q / 2,
          t = -q - s;
        col = Math.round(q);
        row = Math.round(s);
        const third = Math.round(t);
        if (Math.abs(col - q) > Math.abs(row - s) && Math.abs(col - q) > Math.abs(third - t)) col = -row - third;
        else if (Math.abs(row - s) > Math.abs(third - t)) row = -col - third;
      } else {
        col = columns.index(x, 'floor');
        row = rows.index(y, 'floor');
      }
      if (
        !Number.isSafeInteger(col) ||
        !Number.isSafeInteger(row) ||
        !Number.isSafeInteger(col + 1) ||
        !Number.isSafeInteger(row + 1)
      )
        fail(path, 'needs bin dimensions resolvable at the data coordinates');
      const key = `${col},${row}`;
      const cell = cells.get(key) ?? { x: col, y: row, count: 0 };
      cell.count++;
      cells.set(key, cell);
    }
    const peak = Math.max(...Array.from(cells.values(), (c) => c.count));
    for (const { x, y, count } of cells.values()) {
      let cell: Glyph;
      if (display === 'hexbin') {
        const cx = 1.5 * width * x,
          cy = Math.sqrt(3) * height * (y + x / 2),
          half = (Math.sqrt(3) * height) / 2;
        if (cx - width / 2 === cx + width / 2 || cy - half === cy + half)
          fail(path, 'needs distinct hexagon vertices at the data coordinates');
        cell = {
          kind: 'polygon',
          label: String(count),
          points: [
            [cx + width, cy],
            [cx + width / 2, cy + half],
            [cx - width / 2, cy + half],
            [cx - width, cy],
            [cx - width / 2, cy - half],
            [cx + width / 2, cy - half],
          ],
        };
      } else {
        const left = columns.edge(x),
          right = columns.edge(x + 1),
          bottom = rows.edge(y),
          top = rows.edge(y + 1);
        if (left === right || bottom === top) fail(path, 'needs distinct bin edges at the data coordinates');
        cell = rect(String(count), left, bottom, right, top);
      }
      cell.fillColor = `rgb(${Math.round(225 - (190 * count) / peak)},${Math.round(236 - (133 * count) / peak)},${Math.round(245 - (96 * count) / peak)})`;
      marks.push(cell);
    }
    if (display === 'stanford') {
      if (data.some(([x, y]) => x < 0 || y < 0)) fail(path, 'needs nonnegative errors and protection levels');
      const limit = r.required('alertLimit', number(Number.MIN_VALUE, MAX_VALUE));
      const max = Math.max(limit, ...data.flat());
      marks.push(
        line('Error equals protection level', [
          [0, 0],
          [max, max],
        ]),
        line('Alert limit', [
          [0, limit],
          [max, limit],
        ]),
        line('Error at alert limit', [
          [limit, 0],
          [limit, max],
        ]),
      );
    }
  }
  return checkGeometry(path, marks);
}
