import type { SeriesOf } from '../validate.js';
import { checkGeometry, type XY } from './geometry.js';

type Distribution = Extract<SeriesOf<'cartesian'>, { type: 'distribution' }>;

// Interpolate the sampled KDEs onto one shared grid before accumulating their heights.
export function stackDensities(series: Distribution[], reserve: (count: number) => void): void {
  const groups = new Map<string, Distribution[]>();
  for (const entry of series) {
    if (entry.densityStack === undefined) continue;
    const group = groups.get(entry.densityStack) ?? [];
    group.push(entry);
    groups.set(entry.densityStack, group);
  }
  for (const group of groups.values()) {
    const lines = group.map((entry) => entry.marks[0]!.points);
    const xs = [...new Set(lines.flatMap((points) => points.map(([x]) => x)))].sort((a, b) => a - b);
    // At a support boundary retain the height immediately before, at and immediately after x.
    // Otherwise a polygon would bridge the empty gap between separated distributions.
    const ends = new Set(lines.flatMap((points) => [points[0]![0], points.at(-1)![0]]));
    const samples = xs.flatMap((x) => (ends.has(x) ? [-1, 0, 1] : [0]).map((side) => ({ x, side })));
    reserve(samples.length * 2 * group.length);
    const heights = samples.map(() => 0);
    group.forEach((entry, layer) => {
      const points = lines[layer]!;
      let j = 0;
      const lower: XY[] = samples.map(({ x }, i) => [x, heights[i]!]);
      const upper: XY[] = samples.map(({ x, side }, i) => {
        if ((side < 0 && x === points[0]![0]) || (side > 0 && x === points.at(-1)![0])) return [x, heights[i]!];
        while (j + 1 < points.length - 1 && points[j + 1]![0] < x) j++;
        const [a, b] = [points[j]!, points[j + 1]!];
        if (x >= a[0] && x <= b[0]) heights[i]! += a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
        return [x, heights[i]!];
      });
      entry.marks[0] = { kind: 'polygon', label: 'Stacked density', points: [...upper, ...lower.reverse()] };
      checkGeometry(entry.path, entry.marks);
    });
  }
}
