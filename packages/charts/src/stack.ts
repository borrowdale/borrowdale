import type { CheckedBandAxis, CheckedLinearAxis } from './check-axis.js';
import { aSeries, fail, show } from './read.js';
import type { SeriesOf } from './validate.js';

/** From a series' value at the start of its bar or band to the value at its end, per category. */
export type Span = [from: number, to: number] | null;

/**
 * Where each value of series that stack starts and ends. Series of one group stack positive values
 * up and negative values down (as ECharts does); with `percentOf`, each stack's values become shares
 * of its total. A series alone in its group stands on zero.
 */
export function stackSpans<E extends { data: readonly (number | null)[] }>(
  entries: readonly E[],
  groupOf: (entry: E) => string,
  percentOf: (entry: E) => boolean,
): Map<E, Span[]> {
  const spans = new Map<E, Span[]>();
  const totals = new Map<string, number[]>();
  const sums = new Map<string, number[][]>();
  for (const entry of entries) {
    const total = totals.get(groupOf(entry)) ?? entry.data.map(() => 0);
    entry.data.forEach((value, i) => {
      total[i]! += Math.abs(value ?? 0);
    });
    totals.set(groupOf(entry), total);
  }
  for (const entry of entries) {
    const group = groupOf(entry);
    const total = totals.get(group)!;
    const percent = percentOf(entry);
    const [up, down] = sums.get(group) ?? [entry.data.map(() => 0), entry.data.map(() => 0)];
    sums.set(group, [up!, down!]);
    const share = (part: number, i: number): number => (total[i]! === 0 ? 0 : (part / total[i]!) * 100);
    spans.set(
      entry,
      entry.data.map((value, i) => {
        if (value === null) {
          return null;
        }
        const side = value < 0 ? down! : up!;
        const from = side[i]!;
        side[i] = from + value;
        return percent ? [share(from, i), share(from + value, i)] : [from, from + value];
      }),
    );
  }
  return spans;
}

/** The group a series stacks in: its own, or every one of its type with its stack name in `scope`. */
export function stackGroup(entry: { type: string; index: number; stack: string | undefined }, scope: string): string {
  return `${entry.type}|${scope}|${entry.stack === undefined ? `#${entry.index}` : `@${entry.stack}`}`;
}

type Bar = Extract<SeriesOf<'cartesian'>, { type: 'bar' }>;

/**
 * The weights `weights: "stacks"` asks for: each category of `band` as wide as the total of its stack,
 * as a share of the largest. Every series must be a bar of one stack, shown as shares of its total on
 * a percent axis, so that each column's area is in proportion to the part it shows.
 */
export function stackWeights(series: readonly SeriesOf<'cartesian'>[], band: CheckedBandAxis, value: CheckedLinearAxis, path: string): number[] {
  const bars = series.map((entry) =>
    entry.type === 'bar' ? entry : fail(path, `is "stacks", which needs every series to be a bar, but ${entry.path} is ${aSeries(entry.type)}`));
  const first = bars[0]!;
  for (const bar of bars) {
    const apart = bar.stack === undefined ? 'has no stack'
      : bar.stack !== first.stack ? `stacks in ${show(bar.stack)}, and ${first.path} in ${show(first.stack)}`
      : bar.axis !== first.axis ? `is on ${bar.axis}, and ${first.path} on ${first.axis}`
      : undefined;
    if (apart) fail(path, `is "stacks", which needs every bar in one stack, but ${bar.path} ${apart}`);
  }
  if (!value.percent) fail(path, `is "stacks", which needs the stacks shown as shares: set percent on ${value.path}`);
  const totals = band.categories.map((_, i) => bars.reduce((sum: number, bar: Bar) => sum + Math.abs(bar.data[i] ?? 0), 0));
  const largest = Math.max(...totals);
  return totals.map((total, i) => {
    const weight = total / largest;
    if (weight >= 0.000001) return weight;
    const why = largest === 0 ? 'as every stack does' : `less than a millionth of the largest, ${largest}`;
    return fail(path, `is "stacks", but the stack of ${show(band.categories[i])} totals ${total}, ${why}`);
  });
}
