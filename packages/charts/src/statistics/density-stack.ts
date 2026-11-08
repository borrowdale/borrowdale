import type { SeriesOf } from '../validate.js';
import { checkGeometry, type XY } from './geometry.js';

type Distribution = Extract<SeriesOf<'cartesian'>, { type: 'distribution' }>;

/**
 * Stacked densities, interpolated onto one shared grid before their heights accumulate. Each is drawn
 * as its layer: the area between the heights below it and the heights with it.
 */
export function stackDensities(series: readonly Distribution[], reserve: (count: number) => void): void {
  const groups = new Map<string, { entry: Distribution; curve: XY[] }[]>();
  for (const entry of series) {
    if (entry.densityStack === undefined) continue;
    const { key, curve } = entry.densityStack;
    groups.set(key, [...(groups.get(key) ?? []), { entry, curve }]);
  }
  for (const group of groups.values()) {
    const curves = group.map(({ curve }) => curve);
    const xs = [...new Set(curves.flatMap((points) => points.map(([x]) => x)))].sort((a, b) => a - b);
    // At a support boundary the heights immediately before, at and immediately after x are kept, so
    // no polygon bridges the empty gap between separated distributions.
    const ends = new Set(curves.flatMap((points) => [points[0]![0], points.at(-1)![0]]));
    const samples = xs.flatMap((x) => (ends.has(x) ? [-1, 0, 1] : [0]).map((side) => ({ x, side })));
    let heights = samples.map(() => 0);
    for (const { entry, curve: points } of group) {
      const lower: XY[] = samples.map(({ x }, i) => [x, heights[i]!]);
      let j = 0;
      heights = samples.map(({ x, side }, i) => {
        const below = heights[i]!;
        if ((side < 0 && x === points[0]![0]) || (side > 0 && x === points.at(-1)![0])) return below;
        while (j + 1 < points.length - 1 && points[j + 1]![0] < x) j++;
        const [a, b] = [points[j]!, points[j + 1]!];
        return x >= a[0] && x <= b[0] ? below + (a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])) : below;
      });
      const upper: XY[] = samples.map(({ x }, i) => [x, heights[i]!]);
      entry.marks.push({ kind: 'polygon', label: 'Stacked density', points: [...upper, ...lower.reverse()] });
      checkGeometry(entry.path, entry.marks, reserve);
    }
  }
}
