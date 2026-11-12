import { MAX_CATEGORIES, type CheckedLinearAxis } from '../check-axis.js';
import { boolean, fail, list, MAX_POINTS, MAX_VALUE, number, oneOf, text, type Fields } from '../read.js';
import { checkWritten } from '../scale.js';
import type { SeriesOf } from '../validate.js';

type Histogram = Extract<SeriesOf<'cartesian'>, { type: 'histogram' }>;

/**
 * Counts the samples between strictly increasing edges: an interior edge starts a bin, and the
 * final edge belongs to the last bin. Each sample is placed by comparing it with the edges, never by
 * dividing, so every engine bins it alike.
 */
export function readHistogram(r: Fields, path: string, reserve: (count: number) => void) {
  // Each bin is drawn, with its tooltip, whatever its count: the edges count toward the point budget.
  const edges = r.required('edges', list(2, MAX_CATEGORIES + 1, number(-MAX_VALUE, MAX_VALUE), reserve));
  for (let i = 1; i < edges.length; i++) {
    if (edges[i]! <= edges[i - 1]!) fail(`${path}.edges[${i}]`, 'must exceed the preceding edge');
  }
  const counts = new Array<number>(edges.length - 1).fill(0);
  const samples = r.required('data', list(0, MAX_POINTS, number(edges[0]!, edges.at(-1)!), reserve));
  for (const sample of samples) {
    // The last bin starting at or before the sample, by halving.
    let low = 0;
    let high = counts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (sample < edges[middle]!) high = middle;
      else low = middle;
    }
    counts[low] = counts[low]! + 1;
  }
  const relative = r.optional('frequency', oneOf(['count', 'relative'] as const)) === 'relative';
  const cumulative = r.optional('cumulative', boolean) ?? false;
  let total = 0;
  const heights = counts.map((count) => {
    total += count;
    return (cumulative ? total : count) / (relative && samples.length ? samples.length : 1);
  });
  return { edges, data: heights, stack: r.optional('stack', text()), relative, cumulative };
}

/** Each bin's tooltip states its edges in the x axis' format, which must write every edge exactly. */
export function checkHistogramEdges(series: readonly Histogram[], x: CheckedLinearAxis): void {
  for (const entry of series) entry.edges.forEach((edge, i) => checkWritten(edge, `${entry.path}.edges[${i}]`, x));
}

/** Histograms stack only on the same bins, counted the same way. */
export function checkHistogramStacks(series: readonly Histogram[]): void {
  const first = new Map<string, Histogram>();
  for (const entry of series) {
    if (entry.stack === undefined) continue;
    const base = first.get(entry.stack);
    if (!base) first.set(entry.stack, entry);
    else if (
      entry.relative !== base.relative ||
      entry.cumulative !== base.cumulative ||
      entry.edges.length !== base.edges.length ||
      entry.edges.some((edge, i) => edge !== base.edges[i])
    ) {
      fail(entry.path, `must match the edges, frequency and cumulative options of ${base.path} in its stack`);
    }
  }
}
